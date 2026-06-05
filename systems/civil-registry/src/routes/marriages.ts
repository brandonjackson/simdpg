import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { marriageRegistrations } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createMarriageSchema = z.object({
  spouse_1_citizen_id: z.string().uuid(),
  spouse_2_citizen_id: z.string().uuid(),
  date_of_marriage: z.string().min(1),
  place_of_marriage: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap an async route handler so thrown errors reach the error middleware. */
function asyncHandler(
  fn: (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => Promise<void>,
): import("express").RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /marriages — register a marriage.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createMarriageSchema.parse(req.body);

    const id = uuidv4();
    const now = new Date().toISOString();
    const registrationDate = now.split("T")[0];

    db.insert(marriageRegistrations)
      .values({
        id,
        spouse_1_citizen_id: body.spouse_1_citizen_id,
        spouse_2_citizen_id: body.spouse_2_citizen_id,
        date_of_marriage: body.date_of_marriage,
        place_of_marriage: body.place_of_marriage,
        registration_date: registrationDate,
        status: "registered",
        created_at: now,
        updated_at: now,
      })
      .run();

    const record = db
      .select()
      .from(marriageRegistrations)
      .where(eq(marriageRegistrations.id, id))
      .get();

    emitWebhook("marriage.registered", record as Record<string, unknown>);

    res.status(201).json(record);
  }),
);

/**
 * GET /marriages/:id — get marriage record by ID.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const record = db
      .select()
      .from(marriageRegistrations)
      .where(eq(marriageRegistrations.id, id))
      .get();

    if (!record) {
      res.status(404).json({ error: "Marriage registration not found" });
      return;
    }

    res.json(record);
  }),
);

/**
 * GET /marriages?citizen_id=X — find marriages where either spouse matches.
 * GET /marriages — list all marriage registrations.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const citizenId = req.query.citizen_id as string | undefined;

    if (citizenId) {
      const records = db
        .select()
        .from(marriageRegistrations)
        .where(
          or(
            eq(marriageRegistrations.spouse_1_citizen_id, citizenId),
            eq(marriageRegistrations.spouse_2_citizen_id, citizenId),
          ),
        )
        .all();

      res.json(records);
      return;
    }

    const all = db.select().from(marriageRegistrations).all();
    res.json(all);
  }),
);

export default router;
