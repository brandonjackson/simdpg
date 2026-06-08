import { Router } from "express";
import { sql, desc } from "drizzle-orm";
import { getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import {
  patients,
  encounters,
  vaccinations,
  webhookEvents,
} from "../db/schema.js";

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
