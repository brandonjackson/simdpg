import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { notFound, getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { assessments } from "../db/schema.js";
import {
  assessmentInputSchema,
  createAssessment,
  formatAssessment,
  getAssessmentById,
  getIndicators,
} from "../assessments-service.js";
import { emitWebhook } from "../webhooks.js";
import { asyncHandler } from "./async-handler.js";

const router = Router();

/**
 * POST /assessments — record a needs assessment for a household.
 *
 * Persists the PMT score, income band, and vulnerability indicators, then
 * emits `assessment.completed` so Benefits (via OpenFn) can re-evaluate
 * eligibility for the household.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = assessmentInputSchema.parse(req.body);
    const { assessment } = createAssessment(body);

    emitWebhook("assessment.completed", assessment);

    res.status(201).json(assessment);
  }),
);

/**
 * GET /assessments — list assessments, optionally filtered by household_id,
 * citizen_id (matches the household head), or status.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const householdId = req.query.household_id as string | undefined;
    const citizenId = req.query.citizen_id as string | undefined;
    const status = req.query.status as
      | "active"
      | "expired"
      | "superseded"
      | undefined;
    const { offset, limit, page, per_page } = getPagination(req);

    const filters = [];
    if (householdId) filters.push(eq(assessments.household_id, householdId));
    if (citizenId) filters.push(eq(assessments.head_citizen_id, citizenId));
    if (status) filters.push(eq(assessments.status, status));
    const where = filters.length ? and(...filters) : undefined;

    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(assessments)
        .where(where)
        .get()?.c ?? 0;

    const rows = db
      .select()
      .from(assessments)
      .where(where)
      .limit(limit)
      .offset(offset)
      .all();

    const data = rows.map((row) =>
      formatAssessment(row, getIndicators(row.id)),
    );

    res.json(listResponse(data, { page, per_page }, total));
  }),
);

/**
 * GET /assessments/:id — single assessment with its vulnerability indicators.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const row = getAssessmentById(id);

    if (!row) {
      throw notFound("Assessment not found");
    }

    res.json(formatAssessment(row, getIndicators(id)));
  }),
);

export default router;
