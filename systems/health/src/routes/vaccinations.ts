import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  badRequest,
  notFound,
  getPagination,
  listResponse,
} from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { vaccinations, patients, encounters } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createVaccinationSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().nullable().optional(),
  vaccine_name: z.string().min(1),
  dose_number: z.number().int().positive(),
  date_administered: z.string().min(1),
  next_dose_due: z.string().nullable().optional(),
  batch_number: z.string().min(1),
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
 * POST /vaccinations — record a vaccination.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createVaccinationSchema.parse(req.body);

    // Verify patient exists
    const patient = db
      .select()
      .from(patients)
      .where(eq(patients.id, body.patient_id))
      .get();

    if (!patient) {
      throw notFound("Patient not found");
    }

    // Verify encounter exists if provided
    if (body.encounter_id) {
      const encounter = db
        .select()
        .from(encounters)
        .where(eq(encounters.id, body.encounter_id))
        .get();

      if (!encounter) {
        throw notFound("Encounter not found");
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(vaccinations)
      .values({
        id,
        patient_id: body.patient_id,
        encounter_id: body.encounter_id ?? null,
        vaccine_name: body.vaccine_name,
        dose_number: body.dose_number,
        date_administered: body.date_administered,
        next_dose_due: body.next_dose_due ?? null,
        batch_number: body.batch_number,
        created_at: now,
        updated_at: now,
      })
      .run();

    const vaccination = db
      .select()
      .from(vaccinations)
      .where(eq(vaccinations.id, id))
      .get();

    emitWebhook(
      "vaccination.administered",
      vaccination as Record<string, unknown>,
    );

    res.status(201).json(vaccination);
  }),
);

/**
 * GET /vaccinations?patient_id=X — vaccination history for a patient.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const patientId = req.query.patient_id as string | undefined;

    if (!patientId) {
      throw badRequest("patient_id query parameter is required");
    }

    const where = eq(vaccinations.patient_id, patientId);

    const { offset, limit, page, per_page } = getPagination(req);

    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(vaccinations)
        .where(where)
        .get()?.c ?? 0;

    const results = db
      .select()
      .from(vaccinations)
      .where(where)
      .limit(limit)
      .offset(offset)
      .all();

    res.json(listResponse(results, { page, per_page }, total));
  }),
);

/**
 * GET /vaccinations/overdue?as_of=DATE — patients with overdue vaccinations.
 *
 * Returns vaccinations where next_dose_due < as_of AND no subsequent
 * vaccination of the same vaccine_name exists for that patient.
 */
router.get(
  "/overdue",
  asyncHandler(async (req, res) => {
    const asOf = req.query.as_of as string | undefined;

    if (!asOf) {
      throw badRequest("as_of query parameter is required");
    }

    // Validate date format (basic check)
    if (!/^\d{4}-\d{2}-\d{2}/.test(asOf)) {
      throw badRequest("as_of must be an ISO date (YYYY-MM-DD)");
    }

    const { offset, limit, page, per_page } = getPagination(req);

    // Find vaccinations where:
    //   1. next_dose_due IS NOT NULL
    //   2. next_dose_due < as_of
    //   3. No later vaccination of the same vaccine_name exists for that patient
    //      (i.e., no vaccination with date_administered >= next_dose_due for that
    //       patient + vaccine_name combination)
    const total =
      (
        db.get(sql`
          SELECT count(*) AS c
          FROM vaccinations v
          INNER JOIN patients p ON p.id = v.patient_id
          WHERE v.next_dose_due IS NOT NULL
            AND v.next_dose_due < ${asOf}
            AND NOT EXISTS (
              SELECT 1
              FROM vaccinations v2
              WHERE v2.patient_id = v.patient_id
                AND v2.vaccine_name = v.vaccine_name
                AND v2.date_administered >= v.next_dose_due
            )
        `) as { c: number } | undefined
      )?.c ?? 0;

    const results = db.all(sql`
      SELECT
        v.patient_id,
        p.citizen_id,
        v.vaccine_name,
        v.next_dose_due
      FROM vaccinations v
      INNER JOIN patients p ON p.id = v.patient_id
      WHERE v.next_dose_due IS NOT NULL
        AND v.next_dose_due < ${asOf}
        AND NOT EXISTS (
          SELECT 1
          FROM vaccinations v2
          WHERE v2.patient_id = v.patient_id
            AND v2.vaccine_name = v.vaccine_name
            AND v2.date_administered >= v.next_dose_due
        )
      ORDER BY v.next_dose_due ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json(listResponse(results, { page, per_page }, total));
  }),
);

export default router;
