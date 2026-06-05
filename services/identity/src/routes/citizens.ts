import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq, like, or, sql, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { citizens, addresses, householdMembers } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

export const citizenRouter = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const addressSchema = z.object({
  type: z.enum(["residential", "mailing"]),
  line_1: z.string().min(1),
  line_2: z.string().nullable().optional(),
  city: z.string().min(1),
  postal_code: z.string().min(1),
  from_date: z.string().min(1),
  to_date: z.string().nullable().optional(),
});

const createCitizenSchema = z.object({
  given_name: z.string().min(1),
  family_name: z.string().min(1),
  date_of_birth: z.string().min(1),
  sex: z.enum(["male", "female"]),
  email: z.string().email().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  addresses: z.array(addressSchema).optional(),
  household_id: z.string().uuid().optional(),
  relationship: z.enum(["head", "spouse", "child", "other"]).optional(),
});

const updateCitizenSchema = z.object({
  given_name: z.string().min(1).optional(),
  family_name: z.string().min(1).optional(),
  date_of_birth: z.string().min(1).optional(),
  sex: z.enum(["male", "female"]).optional(),
  email: z.string().email().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  date_of_death: z.string().nullable().optional(),
  status: z.enum(["alive", "deceased"]).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextNationalId(): string {
  const row = db
    .select({ max_id: sql<string>`MAX(national_id)` })
    .from(citizens)
    .get();

  const current = row?.max_id;
  let next = 1;
  if (current) {
    const num = parseInt(current.replace("SIM-", ""), 10);
    next = num + 1;
  }
  return `SIM-${String(next).padStart(6, "0")}`;
}

async function getCitizenWithAddresses(citizenId: string) {
  const citizen = db
    .select()
    .from(citizens)
    .where(eq(citizens.id, citizenId))
    .get();

  if (!citizen) return null;

  const addrs = db
    .select()
    .from(addresses)
    .where(eq(addresses.citizen_id, citizenId))
    .all();

  return { ...citizen, addresses: addrs };
}

// ---------------------------------------------------------------------------
// GET /citizens — list all
// ---------------------------------------------------------------------------
citizenRouter.get("/", async (req, res, next) => {
  try {
    const rows = db.select().from(citizens).all();

    const enriched = rows.map((c) => {
      const addrs = db
        .select()
        .from(addresses)
        .where(eq(addresses.citizen_id, c.id))
        .all();
      return { ...c, addresses: addrs };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /citizens — create
// ---------------------------------------------------------------------------
citizenRouter.post("/", async (req, res, next) => {
  try {
    const body = createCitizenSchema.parse(req.body);

    // Validate: if household_id provided, relationship is required
    if (body.household_id && !body.relationship) {
      res
        .status(400)
        .json({ error: "relationship is required when household_id is provided" });
      return;
    }

    const id = uuidv4();
    const national_id = nextNationalId();
    const now = new Date().toISOString();

    db.insert(citizens)
      .values({
        id,
        national_id,
        given_name: body.given_name,
        family_name: body.family_name,
        date_of_birth: body.date_of_birth,
        sex: body.sex,
        email: body.email ?? null,
        phone_number: body.phone_number ?? null,
        status: "alive",
        created_at: now,
        updated_at: now,
      })
      .run();

    // Insert addresses
    if (body.addresses && body.addresses.length > 0) {
      for (const addr of body.addresses) {
        db.insert(addresses)
          .values({
            id: uuidv4(),
            citizen_id: id,
            type: addr.type,
            line_1: addr.line_1,
            line_2: addr.line_2 ?? null,
            city: addr.city,
            postal_code: addr.postal_code,
            from_date: addr.from_date,
            to_date: addr.to_date ?? null,
          })
          .run();
      }
    }

    // Add to household if requested
    if (body.household_id && body.relationship) {
      db.insert(householdMembers)
        .values({
          id: uuidv4(),
          household_id: body.household_id,
          citizen_id: id,
          relationship: body.relationship,
          from_date: now.split("T")[0],
        })
        .run();
    }

    const result = await getCitizenWithAddresses(id);

    emitWebhook("citizen.created", result as Record<string, unknown>);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /citizens/search?name=X&dob=Y — fuzzy search
// ---------------------------------------------------------------------------
citizenRouter.get("/search", async (req, res, next) => {
  try {
    const { name, dob } = req.query;

    if (name === undefined && dob === undefined) {
      res.status(400).json({ error: "Provide at least 'name' or 'dob' query parameter" });
      return;
    }

    const conditions = [];

    if (typeof name === "string" && name.length > 0) {
      const pattern = `%${name}%`;
      conditions.push(
        or(
          like(citizens.given_name, pattern),
          like(citizens.family_name, pattern),
        ),
      );
    }

    if (typeof dob === "string" && dob.length > 0) {
      conditions.push(eq(citizens.date_of_birth, dob));
    }

    const where =
      conditions.length === 1 ? conditions[0]! : and(...conditions);

    const results = db.select().from(citizens).where(where).all();

    // Attach addresses for each result
    const enriched = results.map((c) => {
      const addrs = db
        .select()
        .from(addresses)
        .where(eq(addresses.citizen_id, c.id))
        .all();
      return { ...c, addresses: addrs };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /citizens/:id — get by UUID (also supports ?national_id=)
// ---------------------------------------------------------------------------
citizenRouter.get("/:id", async (req, res, next) => {
  try {
    const result = await getCitizenWithAddresses(req.params.id);
    if (!result) {
      res.status(404).json({ error: "Citizen not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /citizens/:id — update
// ---------------------------------------------------------------------------
citizenRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateCitizenSchema.parse(req.body);

    // Verify citizen exists
    const existing = db
      .select()
      .from(citizens)
      .where(eq(citizens.id, req.params.id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Citizen not found" });
      return;
    }

    const now = new Date().toISOString();
    const wasAlive = existing.status === "alive";
    const becomingDeceased = body.status === "deceased";

    db.update(citizens)
      .set({
        ...body,
        updated_at: now,
      })
      .where(eq(citizens.id, req.params.id))
      .run();

    const result = await getCitizenWithAddresses(req.params.id);

    if (wasAlive && becomingDeceased) {
      emitWebhook("citizen.deceased", result as Record<string, unknown>);
    } else {
      emitWebhook("citizen.updated", result as Record<string, unknown>);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /citizens/:id/household — household members for citizen's household
// ---------------------------------------------------------------------------
citizenRouter.get("/:id/household", async (req, res, next) => {
  try {
    // Find the citizen's household membership
    const membership = db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.citizen_id, req.params.id),
          sql`${householdMembers.to_date} IS NULL`,
        ),
      )
      .get();

    if (!membership) {
      res.status(404).json({ error: "Citizen is not part of any household" });
      return;
    }

    // Get all members of that household
    const members = db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.household_id, membership.household_id))
      .all();

    // Enrich with citizen data
    const enriched = members.map((m) => {
      const citizen = db
        .select()
        .from(citizens)
        .where(eq(citizens.id, m.citizen_id))
        .get();
      return { ...m, citizen: citizen ?? null };
    });

    res.json({
      household_id: membership.household_id,
      members: enriched,
    });
  } catch (err) {
    next(err);
  }
});
