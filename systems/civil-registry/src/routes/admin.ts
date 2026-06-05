import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  birthRegistrations,
  deathRegistrations,
  marriageRegistrations,
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
