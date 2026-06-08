import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { getPagination, listResponse, badRequest } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { assessments } from "../db/schema.js";
import { getIndicators } from "../assessments-service.js";
import { computeTargeting } from "../targeting.js";
import { asyncHandler } from "./async-handler.js";

const router = Router();

const INCOME_BANDS = ["low", "medium", "high"] as const;
const TARGETING_BANDS = ["priority", "eligible", "not_targeted"] as const;
const INDICATORS = [
  "disability",
  "elderly",
  "single_parent",
  "chronic_illness",
  "unemployed",
  "dependents",
] as const;

/**
 * GET /registry — query the registry of assessed households by targeting
 * criteria. Returns a paginated list of targeting profiles (one per active
 * assessment) matching the filters.
 *
 * Filters: `income_band`, `vulnerability` (an indicator flag the household
 * must carry), `targeting_band`, and `targeted` (true/false).
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const incomeBand = req.query.income_band as string | undefined;
    const vulnerability = req.query.vulnerability as string | undefined;
    const targetingBand = req.query.targeting_band as string | undefined;
    const targetedParam = req.query.targeted as string | undefined;
    const { offset, limit, page, per_page } = getPagination(req);

    if (incomeBand && !INCOME_BANDS.includes(incomeBand as never)) {
      throw badRequest(`'income_band' must be one of ${INCOME_BANDS.join(", ")}`);
    }
    if (vulnerability && !INDICATORS.includes(vulnerability as never)) {
      throw badRequest(`'vulnerability' must be one of ${INDICATORS.join(", ")}`);
    }
    if (targetingBand && !TARGETING_BANDS.includes(targetingBand as never)) {
      throw badRequest(
        `'targeting_band' must be one of ${TARGETING_BANDS.join(", ")}`,
      );
    }

    const filters = [eq(assessments.status, "active")];
    if (incomeBand) {
      filters.push(eq(assessments.income_band, incomeBand as never));
    }

    const rows = db
      .select()
      .from(assessments)
      .where(and(...filters))
      .all();

    let profiles = rows.map((row) =>
      computeTargeting(row.household_id, row, getIndicators(row.id)),
    );

    if (vulnerability) {
      profiles = profiles.filter((p) =>
        p.vulnerability_flags.includes(vulnerability as never),
      );
    }
    if (targetingBand) {
      profiles = profiles.filter((p) => p.targeting_band === targetingBand);
    }
    if (targetedParam !== undefined) {
      const wantTargeted = targetedParam === "true";
      profiles = profiles.filter((p) => p.targeted === wantTargeted);
    }

    const total = profiles.length;
    const pageItems = profiles.slice(offset, offset + limit);

    res.json(listResponse(pageItems, { page, per_page }, total));
  }),
);

export default router;
