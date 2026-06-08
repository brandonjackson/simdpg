import { Router } from "express";
import { sql, desc } from "drizzle-orm";
import { getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import {
  birthRegistrations,
  deathRegistrations,
  marriageRegistrations,
  webhookEvents,
} from "../db/schema.js";

export const adminRouter = Router();

function count(
  table:
    | typeof birthRegistrations
    | typeof deathRegistrations
    | typeof marriageRegistrations,
): number {
  return db.select({ c: sql<number>`count(*)` }).from(table).get()?.c ?? 0;
}

// ---------------------------------------------------------------------------
// GET /admin/stats — vital event counts
// ---------------------------------------------------------------------------
adminRouter.get("/stats", (_req, res, next) => {
  try {
    res.json({
      system: "civil-registry",
      births: count(birthRegistrations),
      deaths: count(deathRegistrations),
      marriages: count(marriageRegistrations),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/webhooks — paginated log of emitted webhook events (debugging)
// ---------------------------------------------------------------------------
adminRouter.get("/webhooks", (req, res, next) => {
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
// POST /admin/reset — wipe all vital event registrations
// ---------------------------------------------------------------------------
adminRouter.post("/reset", (_req, res, next) => {
  try {
    db.delete(birthRegistrations).run();
    db.delete(deathRegistrations).run();
    db.delete(marriageRegistrations).run();
    res.json({ system: "civil-registry", reset: true });
  } catch (err) {
    next(err);
  }
});

export default adminRouter;
