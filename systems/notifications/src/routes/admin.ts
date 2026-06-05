import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";

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
