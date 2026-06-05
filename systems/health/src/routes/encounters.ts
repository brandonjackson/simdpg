import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { encounters, patients } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createEncounterSchema = z.object({
  patient_id: z.string().uuid(),
  type: z.enum(["checkup", "emergency", "vaccination", "consultation"]),
  date: z.string().min(1),
  facility: z.string().min(1),
  provider: z.string().min(1),
  diagnosis: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z
    .enum(["completed", "scheduled", "cancelled"])
    .optional()
    .default("completed"),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * POST /encounters — record a new encounter.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createEncounterSchema.parse(req.body);

    // Verify patient exists
    const patient = db
      .select()
      .from(patients)
      .where(eq(patients.id, body.patient_id))
      .get();

    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(encounters)
      .values({
        id,
        patient_id: body.patient_id,
        type: body.type,
        date: body.date,
        facility: body.facility,
        provider: body.provider,
        diagnosis: body.diagnosis ?? null,
        notes: body.notes ?? null,
        status: body.status,
        created_at: now,
        updated_at: now,
      })
      .run();

    const encounter = db
      .select()
      .from(encounters)
      .where(eq(encounters.id, id))
      .get();

    if (body.status === "completed") {
      emitWebhook(
        "encounter.completed",
        encounter as Record<string, unknown>,
      );
    }

    res.status(201).json(encounter);
  }),
);

/**
 * GET /encounters?patient_id=X&type=Y — query encounters.
 * patient_id is required, type is an optional filter.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const patientId = req.query.patient_id as string | undefined;
    const type = req.query.type as string | undefined;

    if (!patientId) {
      res
        .status(400)
        .json({ error: "patient_id query parameter is required" });
      return;
    }

    const conditions = [eq(encounters.patient_id, patientId)];

    if (type) {
      const validTypes = [
        "checkup",
        "emergency",
        "vaccination",
        "consultation",
      ] as const;
      if (!validTypes.includes(type as (typeof validTypes)[number])) {
        res.status(400).json({ error: `Invalid type: ${type}` });
        return;
      }
      conditions.push(
        eq(encounters.type, type as (typeof validTypes)[number]),
      );
    }

    const results = db
      .select()
      .from(encounters)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .all();

    res.json(results);
  }),
);

/**
 * GET /encounters/:id — get a single encounter by UUID.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const encounter = db
      .select()
      .from(encounters)
      .where(eq(encounters.id, id))
      .get();

    if (!encounter) {
      res.status(404).json({ error: "Encounter not found" });
      return;
    }

    res.json(encounter);
  }),
);

export default router;
