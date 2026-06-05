import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { deathRegistrations } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createDeathSchema = z.object({
  citizen_id: z.string().uuid(),
  date_of_death: z.string().min(1),
  place_of_death: z.string().min(1),
  cause_of_death: z.string().nullable().optional(),
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
 * POST /deaths — register a death.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createDeathSchema.parse(req.body);

    const id = uuidv4();
    const now = new Date().toISOString();
    const registrationDate = now.split("T")[0];

    db.insert(deathRegistrations)
      .values({
        id,
        citizen_id: body.citizen_id,
        date_of_death: body.date_of_death,
        place_of_death: body.place_of_death,
        cause_of_death: body.cause_of_death ?? null,
        registration_date: registrationDate,
        status: "registered",
        created_at: now,
        updated_at: now,
      })
      .run();

    const record = db
      .select()
      .from(deathRegistrations)
      .where(eq(deathRegistrations.id, id))
      .get();

    emitWebhook("death.registered", record as Record<string, unknown>);

    res.status(201).json(record);
  }),
);

/**
 * GET /deaths/:id — get death record by ID.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const record = db
      .select()
      .from(deathRegistrations)
      .where(eq(deathRegistrations.id, id))
      .get();

    if (!record) {
      res.status(404).json({ error: "Death registration not found" });
      return;
    }

    res.json(record);
  }),
);

/**
 * GET /deaths?citizen_id=X — find death records for citizen.
 * GET /deaths — list all death registrations.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const citizenId = req.query.citizen_id as string | undefined;

    if (citizenId) {
      const records = db
        .select()
        .from(deathRegistrations)
        .where(eq(deathRegistrations.citizen_id, citizenId))
        .all();

      res.json(records);
      return;
    }

    const all = db.select().from(deathRegistrations).all();
    res.json(all);
  }),
);

export default router;
