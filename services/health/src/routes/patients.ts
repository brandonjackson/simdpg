import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { patients } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createPatientSchema = z.object({
  citizen_id: z.string().min(1),
  blood_type: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .nullable()
    .optional(),
  allergies: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional()
    .transform((val) => {
      if (val == null) return null;
      if (Array.isArray(val)) return JSON.stringify(val);
      return val;
    }),
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
 * POST /patients — register a new patient.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createPatientSchema.parse(req.body);

    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(patients)
      .values({
        id,
        citizen_id: body.citizen_id,
        blood_type: body.blood_type ?? null,
        allergies: body.allergies ?? null,
        registered_at: now,
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .run();

    const patient = db
      .select()
      .from(patients)
      .where(eq(patients.id, id))
      .get();

    emitWebhook("patient.registered", patient as Record<string, unknown>);

    res.status(201).json(patient);
  }),
);

/**
 * GET /patients?citizen_id=X — lookup patient by citizen ID.
 * GET /patients — list all patients.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const citizenId = req.query.citizen_id as string | undefined;

    if (citizenId) {
      const patient = db
        .select()
        .from(patients)
        .where(eq(patients.citizen_id, citizenId))
        .get();

      if (!patient) {
        res.status(404).json({ error: "Patient not found" });
        return;
      }

      res.json(patient);
      return;
    }

    const all = db.select().from(patients).all();
    res.json(all);
  }),
);

/**
 * GET /patients/:id — get patient by UUID.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const patient = db
      .select()
      .from(patients)
      .where(eq(patients.id, id))
      .get();

    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    res.json(patient);
  }),
);

export default router;
