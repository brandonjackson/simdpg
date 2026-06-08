import { Router } from "express";
import { assessmentInputSchema, createAssessment } from "../assessments-service.js";
import { computeTargeting } from "../targeting.js";
import { emitWebhook } from "../webhooks.js";
import { asyncHandler } from "./async-handler.js";

const router = Router();

/**
 * POST /recertify — re-run targeting for a household.
 *
 * Issues a fresh assessment (data_source `recertified`) and marks the
 * household's previous active assessment as `superseded`. Emits
 * `targeting.updated` so Benefits can re-assess the household's enrolments.
 * Accepts the same body as POST /assessments.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = assessmentInputSchema.parse(req.body);

    const { assessment, supersededId } = createAssessment(body, {
      supersedePrevious: true,
      dataSource: "recertified",
    });

    const profile = computeTargeting(
      assessment.household_id,
      assessment,
      assessment.indicators.map((ind) => ({
        id: ind.id,
        assessment_id: assessment.id,
        indicator: ind.indicator,
        value: ind.value,
        weight: ind.weight,
      })),
    );

    emitWebhook("targeting.updated", {
      ...profile,
      superseded_assessment_id: supersededId,
    });

    res.status(201).json({ ...assessment, superseded_assessment_id: supersededId });
  }),
);

export default router;
