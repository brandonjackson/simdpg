import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { birthRegistrations } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createBirthSchema = z.object({
  child_citizen_id: z.string().uuid(),
  mother_citizen_id: z.string().uuid(),
  father_citizen_id: z.string().uuid().nullable().optional(),
  date_of_birth: z.string().min(1),
  place_of_birth: z.string().min(1),
  registrar_notes: z.string().nullable().optional(),
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
 * POST /births — register a birth.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createBirthSchema.parse(req.body);

    const id = uuidv4();
    const now = new Date().toISOString();
    const registrationDate = now.split("T")[0];

    db.insert(birthRegistrations)
      .values({
        id,
        child_citizen_id: body.child_citizen_id,
        mother_citizen_id: body.mother_citizen_id,
        father_citizen_id: body.father_citizen_id ?? null,
        date_of_birth: body.date_of_birth,
        place_of_birth: body.place_of_birth,
        registration_date: registrationDate,
        registrar_notes: body.registrar_notes ?? null,
        status: "registered",
        created_at: now,
        updated_at: now,
      })
      .run();

    const record = db
      .select()
      .from(birthRegistrations)
      .where(eq(birthRegistrations.id, id))
      .get();

    emitWebhook("birth.registered", record as Record<string, unknown>);

    res.status(201).json(record);
  }),
);

/**
 * GET /births/:id — get birth record by ID.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const record = db
      .select()
      .from(birthRegistrations)
      .where(eq(birthRegistrations.id, id))
      .get();

    if (!record) {
      res.status(404).json({ error: "Birth registration not found" });
      return;
    }

    res.json(record);
  }),
);

/**
 * GET /births?citizen_id=X — find birth record where child_citizen_id = X.
 * GET /births — list all birth registrations.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const citizenId = req.query.citizen_id as string | undefined;

    if (citizenId) {
      const records = db
        .select()
        .from(birthRegistrations)
        .where(eq(birthRegistrations.child_citizen_id, citizenId))
        .all();

      res.json(records);
      return;
    }

    const all = db.select().from(birthRegistrations).all();
    res.json(all);
  }),
);

export default router;
