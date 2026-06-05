import { Router } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { payments, enrollments } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const schedulePaymentsSchema = z.object({
  enrollment_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().min(1).default("SIM"),
  count: z.number().int().positive().default(1),
  start_date: z.string().optional(),
});

const updatePaymentSchema = z.object({
  status: z.enum(["scheduled", "paid", "failed"]),
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

/** Add N months to a Date, returning a new Date. */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Format a Date as ISO date string (YYYY-MM-DD). */
function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /payments — list payments, optionally filter by enrollment_id.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const enrollmentId = req.query.enrollment_id as string | undefined;

    if (enrollmentId) {
      const rows = db
        .select()
        .from(payments)
        .where(eq(payments.enrollment_id, enrollmentId))
        .all();
      res.json(rows);
      return;
    }

    const rows = db.select().from(payments).all();
    res.json(rows);
  }),
);

/**
 * POST /payments/schedule — create one or more scheduled payments.
 */
router.post(
  "/schedule",
  asyncHandler(async (req, res) => {
    const body = schedulePaymentsSchema.parse(req.body);

    // Verify the enrollment exists
    const enrollment = db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, body.enrollment_id))
      .get();

    if (!enrollment) {
      res.status(404).json({ error: "Enrollment not found" });
      return;
    }

    const startDate = body.start_date
      ? new Date(body.start_date)
      : new Date();
    const now = new Date().toISOString();

    const created: (typeof payments.$inferSelect)[] = [];

    for (let i = 0; i < body.count; i++) {
      const scheduledDate = toISODate(addMonths(startDate, i));
      const id = uuidv4();

      db.insert(payments)
        .values({
          id,
          enrollment_id: body.enrollment_id,
          amount: body.amount,
          currency: body.currency,
          status: "scheduled",
          scheduled_date: scheduledDate,
          created_at: now,
          updated_at: now,
        })
        .run();

      const payment = db
        .select()
        .from(payments)
        .where(eq(payments.id, id))
        .get();

      if (payment) {
        created.push(payment);
      }
    }

    res.status(201).json(created);
  }),
);

/**
 * PATCH /payments/:id — update payment status (e.g. mark as paid).
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    const body = updatePaymentSchema.parse(req.body);
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status: body.status,
      updated_at: now,
    };

    if (body.status === "paid") {
      updates.paid_date = now;
    }

    db.update(payments).set(updates).where(eq(payments.id, id)).run();

    const updated = db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .get();

    if (body.status === "paid") {
      emitWebhook("payment.completed", updated as Record<string, unknown>);
    }

    res.json(updated);
  }),
);

export default router;
