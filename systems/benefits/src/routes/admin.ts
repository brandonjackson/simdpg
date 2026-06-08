import { Router } from "express";
import { sql, desc } from "drizzle-orm";
import { getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import {
  programs,
  enrollments,
  payments,
  webhookEvents,
} from "../db/schema.js";

const router = Router();

function count(
  table: typeof programs | typeof enrollments | typeof payments,
): number {
  return db.select({ c: sql<number>`count(*)` }).from(table).get()?.c ?? 0;
}

// ---------------------------------------------------------------------------
// GET /admin/stats — programme, enrollment, and payment counts
// ---------------------------------------------------------------------------
router.get("/stats", (_req, res, next) => {
  try {
    res.json({
      system: "benefits",
      programs: count(programs),
      enrollments: count(enrollments),
      payments: count(payments),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/webhooks — paginated log of emitted webhook events (debugging)
// ---------------------------------------------------------------------------
router.get("/webhooks", (req, res, next) => {
  try {
    const { offset, limit, page, per_page } = getPagination(req);

    const total =
      db.select({ c: sql<number>`count(*)` }).from(webhookEvents).get()?.c ?? 0;

    const rows = db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.time))
      .limit(limit)
      .offset(offset)
      .all();

    const events = rows.map((row) => ({
      ...row,
      data: JSON.parse(row.data) as unknown,
    }));

    res.json(listResponse(events, { page, per_page }, total));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/reset — wipe enrollments and payments.
//
// Programmes are reference/configuration data (seeded), not population data,
// so they are preserved across a reset.
// ---------------------------------------------------------------------------
router.post("/reset", (_req, res, next) => {
  try {
    // Delete dependents first to respect foreign keys.
    db.delete(payments).run();
    db.delete(enrollments).run();
    res.json({ system: "benefits", reset: true, programs_preserved: true });
  } catch (err) {
    next(err);
  }
});

export default router;
