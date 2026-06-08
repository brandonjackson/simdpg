import { Router } from "express";
import {
  getActiveAssessment,
  getIndicators,
} from "../assessments-service.js";
import { computeTargeting } from "../targeting.js";
import { asyncHandler } from "./async-handler.js";

const router = Router();

/**
 * GET /households/:id/targeting-profile — the targeting profile (PMT score,
 * income band, vulnerability flags, and a targeting determination) for a
 * household. This is the endpoint Benefits calls during eligibility checks.
 *
 * Returns 200 with `has_assessment: false` (rather than 404) when the
 * household has never been assessed, so callers can treat "no assessment" as
 * a routine, non-targeted outcome.
 */
router.get(
  "/:id/targeting-profile",
  asyncHandler(async (req, res) => {
    const householdId = req.params.id as string;
    const assessment = getActiveAssessment(householdId);
    const indicators = assessment ? getIndicators(assessment.id) : [];

    res.json(computeTargeting(householdId, assessment, indicators));
  }),
);

export default router;
