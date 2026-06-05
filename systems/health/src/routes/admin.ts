import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { patients, encounters, vaccinations } from "../db/schema.js";

const router = Router();

function count(
  table: typeof patients | typeof encounters | typeof vaccinations,
): number {
  return db.select({ c: sql<number>`count(*)` }).from(table).get()?.c ?? 0;
}

// ---------------------------------------------------------------------------
// GET /admin/stats — patient, encounter, and vaccination counts
// ---------------------------------------------------------------------------
router.get("/stats", (_req, res, next) => {
  try {
    res.json({
      system: "health",
      patients: count(patients),
      encounters: count(encounters),
      vaccinations: count(vaccinations),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/reset — wipe all health records
// ---------------------------------------------------------------------------
router.post("/reset", (_req, res, next) => {
  try {
    // Delete dependents first to respect foreign keys.
    db.delete(vaccinations).run();
    db.delete(encounters).run();
    db.delete(patients).run();
    res.json({ system: "health", reset: true });
  } catch (err) {
    next(err);
  }
});

export default router;
