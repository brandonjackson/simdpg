import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { programs, enrollments, payments } from "../db/schema.js";

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
