import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { programs } from "../db/schema.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  eligibility_rules: z.record(z.unknown()).default({}),
  payment_amount: z.number().positive(),
  payment_frequency: z.enum(["monthly", "one-time", "quarterly"]),
  status: z.enum(["active", "suspended", "closed"]).default("active"),
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

/** Parse eligibility_rules JSON string and attach to a program row. */
function formatProgram(row: typeof programs.$inferSelect) {
  let parsedRules: unknown = {};
  try {
    parsedRules = JSON.parse(row.eligibility_rules);
  } catch {
    parsedRules = {};
  }
  return { ...row, eligibility_rules: parsedRules };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /programs — list all programs, optionally filter by status.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = req.query.status as "active" | "suspended" | "closed" | undefined;

    let rows;
    if (status) {
      rows = db
        .select()
        .from(programs)
        .where(eq(programs.status, status))
        .all();
    } else {
      rows = db.select().from(programs).all();
    }

    res.json(rows.map(formatProgram));
  }),
);

/**
 * GET /programs/:id — single program with parsed eligibility_rules.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;

    const program = db
      .select()
      .from(programs)
      .where(eq(programs.id, id))
      .get();

    if (!program) {
      res.status(404).json({ error: "Program not found" });
      return;
    }

    res.json(formatProgram(program));
  }),
);

/**
 * POST /programs — create a new program.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createProgramSchema.parse(req.body);

    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(programs)
      .values({
        id,
        name: body.name,
        description: body.description,
        eligibility_rules: JSON.stringify(body.eligibility_rules),
        payment_amount: body.payment_amount,
        payment_frequency: body.payment_frequency,
        status: body.status,
        created_at: now,
        updated_at: now,
      })
      .run();

    const created = db
      .select()
      .from(programs)
      .where(eq(programs.id, id))
      .get();

    res.status(201).json(formatProgram(created!));
  }),
);

export default router;
