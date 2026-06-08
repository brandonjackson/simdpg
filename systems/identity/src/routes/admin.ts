import { Router } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import {
  citizens,
  addresses,
  householdMembers,
  webhookEvents,
} from "../db/schema.js";

export const adminRouter = Router();

// ---------------------------------------------------------------------------
// GET /admin/stats — record counts for population management
// ---------------------------------------------------------------------------
adminRouter.get("/stats", (_req, res, next) => {
  try {
    const total =
      db.select({ c: sql<number>`count(*)` }).from(citizens).get()?.c ?? 0;
    const deceased =
      db
        .select({ c: sql<number>`count(*)` })
        .from(citizens)
        .where(eq(citizens.status, "deceased"))
        .get()?.c ?? 0;
    const households =
      db
        .select({ c: sql<number>`count(distinct ${householdMembers.household_id})` })
        .from(householdMembers)
        .get()?.c ?? 0;

    res.json({
      system: "identity",
      citizens: total,
      alive: total - deceased,
      deceased,
      households,
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
// POST /admin/reset — wipe all citizen, address, and household data
// ---------------------------------------------------------------------------
adminRouter.post("/reset", (_req, res, next) => {
  try {
    // Delete dependents first to respect foreign keys.
    db.delete(addresses).run();
    db.delete(householdMembers).run();
    db.delete(citizens).run();
    res.json({ system: "identity", reset: true });
  } catch (err) {
    next(err);
  }
});

export default adminRouter;
