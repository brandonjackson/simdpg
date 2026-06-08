import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  badRequest,
  notFound,
  getPagination,
  listResponse,
} from "@simdpg/system-kit";
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
      throw notFound("Patient not found");
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
      throw badRequest("patient_id query parameter is required");
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
        throw badRequest(`Invalid type: ${type}`);
      }
      conditions.push(
        eq(encounters.type, type as (typeof validTypes)[number]),
      );
    }

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const { offset, limit, page, per_page } = getPagination(req);

    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(encounters)
        .where(where)
        .get()?.c ?? 0;

    const results = db
      .select()
      .from(encounters)
      .where(where)
      .limit(limit)
      .offset(offset)
      .all();

    res.json(listResponse(results, { page, per_page }, total));
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
      throw notFound("Encounter not found");
    }

    res.json(encounter);
  }),
);

export default router;
