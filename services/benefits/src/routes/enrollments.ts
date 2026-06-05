import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { enrollments, programs } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createEnrollmentSchema = z.object({
  program_id: z.string().uuid(),
  citizen_id: z.string().min(1),
  household_id: z.string().nullable().optional(),
});

const updateEnrollmentSchema = z.object({
  status: z.enum(["pending", "active", "suspended", "terminated"]),
  termination_reason: z.string().nullable().optional(),
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
 * POST /enrollments — enroll a citizen in a program.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createEnrollmentSchema.parse(req.body);

    // Verify the program exists
    const program = db
      .select()
      .from(programs)
      .where(eq(programs.id, body.program_id))
      .get();

    if (!program) {
      res.status(404).json({ error: "Program not found" });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(enrollments)
      .values({
        id,
        program_id: body.program_id,
        citizen_id: body.citizen_id,
        household_id: body.household_id ?? null,
        status: "active",
        enrolled_at: now,
        created_at: now,
        updated_at: now,
      })
      .run();

    const created = db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, id))
      .get();

    emitWebhook("enrollment.created", {
      ...created,
      program_name: program.name,
    });

    res.status(201).json({ ...created, program_name: program.name });
  }),
);

/**
 * GET /enrollments — list enrollments, optionally filter by citizen_id.
 * Includes program name via join.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const citizenId = req.query.citizen_id as string | undefined;

    let query = db
      .select({
        id: enrollments.id,
        program_id: enrollments.program_id,
        citizen_id: enrollments.citizen_id,
        household_id: enrollments.household_id,
        status: enrollments.status,
        enrolled_at: enrollments.enrolled_at,
        terminated_at: enrollments.terminated_at,
        termination_reason: enrollments.termination_reason,
        created_at: enrollments.created_at,
        updated_at: enrollments.updated_at,
        program_name: programs.name,
      })
      .from(enrollments)
      .innerJoin(programs, eq(enrollments.program_id, programs.id));

    const rows = citizenId
      ? query.where(eq(enrollments.citizen_id, citizenId)).all()
      : query.all();

    res.json(rows);
  }),
);

/**
 * GET /enrollments/:id — single enrollment with program details.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const row = db
      .select({
        id: enrollments.id,
        program_id: enrollments.program_id,
        citizen_id: enrollments.citizen_id,
        household_id: enrollments.household_id,
        status: enrollments.status,
        enrolled_at: enrollments.enrolled_at,
        terminated_at: enrollments.terminated_at,
        termination_reason: enrollments.termination_reason,
        created_at: enrollments.created_at,
        updated_at: enrollments.updated_at,
        program_name: programs.name,
        program_payment_amount: programs.payment_amount,
        program_payment_frequency: programs.payment_frequency,
      })
      .from(enrollments)
      .innerJoin(programs, eq(enrollments.program_id, programs.id))
      .where(eq(enrollments.id, id))
      .get();

    if (!row) {
      res.status(404).json({ error: "Enrollment not found" });
      return;
    }

    res.json(row);
  }),
);

/**
 * PATCH /enrollments/:id — update enrollment status.
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Enrollment not found" });
      return;
    }

    const body = updateEnrollmentSchema.parse(req.body);
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status: body.status,
      updated_at: now,
    };

    if (body.status === "terminated") {
      updates.terminated_at = now;
      if (body.termination_reason) {
        updates.termination_reason = body.termination_reason;
      }
    }

    db.update(enrollments).set(updates).where(eq(enrollments.id, id)).run();

    const updated = db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, id))
      .get();

    // Look up program name for the response
    const program = db
      .select()
      .from(programs)
      .where(eq(programs.id, existing.program_id))
      .get();

    const result = { ...updated, program_name: program?.name };

    if (body.status === "terminated") {
      emitWebhook("enrollment.terminated", result);
    }

    res.json(result);
  }),
);

export default router;
