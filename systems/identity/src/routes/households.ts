import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq, and, sql } from "drizzle-orm";
import { badRequest, notFound } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { citizens, householdMembers } from "../db/schema.js";

export const householdRouter = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const memberSchema = z.object({
  citizen_id: z.string().uuid(),
  relationship: z.enum(["head", "spouse", "child", "other"]),
});

const createHouseholdSchema = z.object({
  members: z.array(memberSchema).min(1),
});

const patchMembersSchema = z.object({
  add: z.array(memberSchema).optional().default([]),
  remove: z.array(z.string().uuid()).optional().default([]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHouseholdMembers(householdId: string) {
  const members = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.household_id, householdId))
    .all();

  return members.map((m) => {
    const citizen = db
      .select()
      .from(citizens)
      .where(eq(citizens.id, m.citizen_id))
      .get();
    return { ...m, citizen: citizen ?? null };
  });
}

// ---------------------------------------------------------------------------
// POST /households — create a new household
// ---------------------------------------------------------------------------
householdRouter.post("/", async (req, res, next) => {
  try {
    const body = createHouseholdSchema.parse(req.body);
    const householdId = uuidv4();
    const today = new Date().toISOString().split("T")[0];

    // Verify all citizen IDs exist
    for (const member of body.members) {
      const citizen = db
        .select()
        .from(citizens)
        .where(eq(citizens.id, member.citizen_id))
        .get();

      if (!citizen) {
        throw badRequest(`Citizen not found: ${member.citizen_id}`);
      }
    }

    for (const member of body.members) {
      db.insert(householdMembers)
        .values({
          id: uuidv4(),
          household_id: householdId,
          citizen_id: member.citizen_id,
          relationship: member.relationship,
          from_date: today,
        })
        .run();
    }

    const members = getHouseholdMembers(householdId);
    res.status(201).json({ household_id: householdId, members });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /households/:id/members — add/remove members
// ---------------------------------------------------------------------------
householdRouter.patch("/:id/members", async (req, res, next) => {
  try {
    const householdId = req.params.id;
    const body = patchMembersSchema.parse(req.body);

    // Verify the household exists (has at least one member)
    const existing = db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.household_id, householdId))
      .get();

    if (!existing) {
      throw notFound("Household not found");
    }

    const today = new Date().toISOString().split("T")[0];

    // Remove members (soft-remove by setting to_date)
    for (const citizenId of body.remove) {
      db.update(householdMembers)
        .set({ to_date: today })
        .where(
          and(
            eq(householdMembers.household_id, householdId),
            eq(householdMembers.citizen_id, citizenId),
            sql`${householdMembers.to_date} IS NULL`,
          ),
        )
        .run();
    }

    // Add new members
    for (const member of body.add) {
      // Verify citizen exists
      const citizen = db
        .select()
        .from(citizens)
        .where(eq(citizens.id, member.citizen_id))
        .get();

      if (!citizen) {
        throw badRequest(`Citizen not found: ${member.citizen_id}`);
      }

      db.insert(householdMembers)
        .values({
          id: uuidv4(),
          household_id: householdId,
          citizen_id: member.citizen_id,
          relationship: member.relationship,
          from_date: today,
        })
        .run();
    }

    const members = getHouseholdMembers(householdId);
    res.json({ household_id: householdId, members });
  } catch (err) {
    next(err);
  }
});
