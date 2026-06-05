import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { programs } from "../db/schema.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const eligibilityCheckSchema = z.object({
  citizen_id: z.string().min(1),
  program_id: z.string().uuid(),
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
 * POST /eligibility/check — simplified eligibility check.
 *
 * In a production system this would call the identity service to fetch the
 * citizen's age and household data, then evaluate the program's eligibility
 * rules. For now, it always returns eligible=true as a stub — the real
 * cross-service check will be wired up via OpenFn.
 */
router.post(
  "/check",
  asyncHandler(async (req, res) => {
    const body = eligibilityCheckSchema.parse(req.body);

    const program = db
      .select()
      .from(programs)
      .where(eq(programs.id, body.program_id))
      .get();

    if (!program) {
      res.status(404).json({ error: "Program not found" });
      return;
    }

    let parsedRules: Record<string, unknown> = {};
    try {
      parsedRules = JSON.parse(program.eligibility_rules);
    } catch {
      parsedRules = {};
    }

    // Stub: always eligible. Real implementation would call identity service.
    const eligible = true;
    const reasons = ["eligibility check passed"];

    res.json({
      eligible,
      reasons,
      citizen_id: body.citizen_id,
      program: {
        id: program.id,
        name: program.name,
        eligibility_rules: parsedRules,
      },
    });
  }),
);

export default router;
