import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { citizens, addresses, householdMembers } from "../db/schema.js";

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
