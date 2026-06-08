import { Router } from "express";
import { sql, desc } from "drizzle-orm";
import { getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { notifications, webhookEvents } from "../db/schema.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /admin/stats — notification count
// ---------------------------------------------------------------------------
router.get("/stats", (_req, res, next) => {
  try {
    const count =
      db.select({ c: sql<number>`count(*)` }).from(notifications).get()?.c ?? 0;
    res.json({ system: "notifications", notifications: count });
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
// POST /admin/reset — wipe all notifications
// ---------------------------------------------------------------------------
router.post("/reset", (_req, res, next) => {
  try {
    db.delete(notifications).run();
    res.json({ system: "notifications", reset: true });
  } catch (err) {
    next(err);
  }
});

export default router;
