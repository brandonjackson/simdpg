import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { badRequest, getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import {
  birthRegistrations,
  deathRegistrations,
  marriageRegistrations,
} from "../db/schema.js";

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VitalEvent {
  type: "birth" | "death" | "marriage";
  date: string;
  id: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap an async route handler so thrown errors reach the error middleware. */
function asyncHandler(
  fn: (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => Promise<void>,
): import("express").RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /events?citizen_id=X — return ALL vital events for a citizen.
 * Includes births (as child, mother, or father), deaths, and marriages.
 * Returns a unified array sorted chronologically.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const citizenId = req.query.citizen_id as string | undefined;

    if (!citizenId) {
      throw badRequest("citizen_id query parameter is required");
    }

    const { offset, limit, page, per_page } = getPagination(req);

    const events: VitalEvent[] = [];

    // Births where citizen is child, mother, or father
    const births = db
      .select()
      .from(birthRegistrations)
      .where(
        or(
          eq(birthRegistrations.child_citizen_id, citizenId),
          eq(birthRegistrations.mother_citizen_id, citizenId),
          eq(birthRegistrations.father_citizen_id, citizenId),
        ),
      )
      .all();

    for (const b of births) {
      events.push({
        type: "birth",
        date: b.date_of_birth,
        id: b.id,
        details: { ...b },
      });
    }

    // Deaths for the citizen
    const deaths = db
      .select()
      .from(deathRegistrations)
      .where(eq(deathRegistrations.citizen_id, citizenId))
      .all();

    for (const d of deaths) {
      events.push({
        type: "death",
        date: d.date_of_death,
        id: d.id,
        details: { ...d },
      });
    }

    // Marriages where citizen is either spouse
    const marriages = db
      .select()
      .from(marriageRegistrations)
      .where(
        or(
          eq(marriageRegistrations.spouse_1_citizen_id, citizenId),
          eq(marriageRegistrations.spouse_2_citizen_id, citizenId),
        ),
      )
      .all();

    for (const m of marriages) {
      events.push({
        type: "marriage",
        date: m.date_of_marriage,
        id: m.id,
        details: { ...m },
      });
    }

    // Sort chronologically
    events.sort((a, b) => a.date.localeCompare(b.date));

    const total = events.length;
    const pageRows = events.slice(offset, offset + limit);

    res.json(listResponse(pageRows, { page, per_page }, total));
  }),
);

export default router;
