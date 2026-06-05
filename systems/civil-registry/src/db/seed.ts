/**
 * Seed script — creates sample birth, death, and marriage registrations.
 * Run: npx tsx src/db/seed.ts  (from systems/civil-registry/)
 */
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import {
  birthRegistrations,
  deathRegistrations,
  marriageRegistrations,
} from "./schema.js";

ensureTables();

// Check if data already exists
const count = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(birthRegistrations)
  .get();

if (count && count.count > 0) {
  console.log(
    `Database already has ${count.count} birth registrations — skipping seed.`,
  );
  process.exit(0);
}

console.log("Seeding civil registry database...");

// ---------------------------------------------------------------------------
// Sample citizen UUIDs (these would exist in the identity system)
// ---------------------------------------------------------------------------

const CITIZENS = {
  amara: "a1b2c3d4-1111-4000-8000-000000000001",
  kofi: "a1b2c3d4-2222-4000-8000-000000000002",
  zara: "a1b2c3d4-3333-4000-8000-000000000003",
  liam: "a1b2c3d4-4444-4000-8000-000000000004",
  mei: "a1b2c3d4-5555-4000-8000-000000000005",
  tariq: "a1b2c3d4-6666-4000-8000-000000000006",
  fatima: "a1b2c3d4-7777-4000-8000-000000000007",
  omar: "a1b2c3d4-8888-4000-8000-000000000008",
  nia: "a1b2c3d4-9999-4000-8000-000000000009",
  kwame: "a1b2c3d4-aaaa-4000-8000-00000000000a",
} as const;

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Birth registrations (5)
// ---------------------------------------------------------------------------

interface SeedBirth {
  child: keyof typeof CITIZENS;
  mother: keyof typeof CITIZENS;
  father: keyof typeof CITIZENS | null;
  date_of_birth: string;
  place_of_birth: string;
  registration_date: string;
  registrar_notes: string | null;
}

const seedBirths: SeedBirth[] = [
  {
    child: "zara",
    mother: "amara",
    father: "kofi",
    date_of_birth: "2010-01-10",
    place_of_birth: "Simville General Hospital",
    registration_date: "2010-01-12",
    registrar_notes: "Normal delivery, healthy child",
  },
  {
    child: "omar",
    mother: "fatima",
    father: "tariq",
    date_of_birth: "2005-04-14",
    place_of_birth: "Oldtown District Hospital",
    registration_date: "2005-04-16",
    registrar_notes: null,
  },
  {
    child: "nia",
    mother: "amara",
    father: null,
    date_of_birth: "1995-08-21",
    place_of_birth: "Simville Maternity Clinic",
    registration_date: "1995-08-25",
    registrar_notes: "Father unknown at time of registration",
  },
  {
    child: "kwame",
    mother: "mei",
    father: "liam",
    date_of_birth: "2000-02-28",
    place_of_birth: "Laketown Community Hospital",
    registration_date: "2000-03-01",
    registrar_notes: null,
  },
  {
    child: "liam",
    mother: "fatima",
    father: "tariq",
    date_of_birth: "1990-11-05",
    place_of_birth: "Oldtown District Hospital",
    registration_date: "1990-11-07",
    registrar_notes: "Premature birth, 36 weeks",
  },
];

for (const b of seedBirths) {
  const id = uuidv4();
  db.insert(birthRegistrations)
    .values({
      id,
      child_citizen_id: CITIZENS[b.child],
      mother_citizen_id: CITIZENS[b.mother],
      father_citizen_id: b.father ? CITIZENS[b.father] : null,
      date_of_birth: b.date_of_birth,
      place_of_birth: b.place_of_birth,
      registration_date: b.registration_date,
      registrar_notes: b.registrar_notes,
      status: "registered",
      created_at: now,
      updated_at: now,
    })
    .run();

  console.log(
    `  Birth: ${b.child} (${b.date_of_birth}) at ${b.place_of_birth}`,
  );
}

// ---------------------------------------------------------------------------
// Death registrations (2)
// ---------------------------------------------------------------------------

interface SeedDeath {
  citizen: keyof typeof CITIZENS;
  date_of_death: string;
  place_of_death: string;
  cause_of_death: string | null;
  registration_date: string;
}

const seedDeaths: SeedDeath[] = [
  {
    citizen: "tariq",
    date_of_death: "2023-09-15",
    place_of_death: "Oldtown District Hospital",
    cause_of_death: "Natural causes",
    registration_date: "2023-09-17",
  },
  {
    citizen: "amara",
    date_of_death: "2024-03-01",
    place_of_death: "Simville General Hospital",
    cause_of_death: null,
    registration_date: "2024-03-03",
  },
];

for (const d of seedDeaths) {
  const id = uuidv4();
  db.insert(deathRegistrations)
    .values({
      id,
      citizen_id: CITIZENS[d.citizen],
      date_of_death: d.date_of_death,
      place_of_death: d.place_of_death,
      cause_of_death: d.cause_of_death,
      registration_date: d.registration_date,
      status: "registered",
      created_at: now,
      updated_at: now,
    })
    .run();

  console.log(
    `  Death: ${d.citizen} (${d.date_of_death}) at ${d.place_of_death}`,
  );
}

// ---------------------------------------------------------------------------
// Marriage registrations (3)
// ---------------------------------------------------------------------------

interface SeedMarriage {
  spouse_1: keyof typeof CITIZENS;
  spouse_2: keyof typeof CITIZENS;
  date_of_marriage: string;
  place_of_marriage: string;
  registration_date: string;
  status: "registered" | "divorced" | "annulled";
}

const seedMarriages: SeedMarriage[] = [
  {
    spouse_1: "kofi",
    spouse_2: "amara",
    date_of_marriage: "2008-06-20",
    place_of_marriage: "Simville City Hall",
    registration_date: "2008-06-20",
    status: "registered",
  },
  {
    spouse_1: "tariq",
    spouse_2: "fatima",
    date_of_marriage: "2003-12-15",
    place_of_marriage: "Oldtown Mosque",
    registration_date: "2003-12-16",
    status: "registered",
  },
  {
    spouse_1: "liam",
    spouse_2: "mei",
    date_of_marriage: "2018-09-10",
    place_of_marriage: "Laketown Gardens",
    registration_date: "2018-09-10",
    status: "registered",
  },
];

for (const m of seedMarriages) {
  const id = uuidv4();
  db.insert(marriageRegistrations)
    .values({
      id,
      spouse_1_citizen_id: CITIZENS[m.spouse_1],
      spouse_2_citizen_id: CITIZENS[m.spouse_2],
      date_of_marriage: m.date_of_marriage,
      place_of_marriage: m.place_of_marriage,
      registration_date: m.registration_date,
      status: m.status,
      created_at: now,
      updated_at: now,
    })
    .run();

  console.log(
    `  Marriage: ${m.spouse_1} & ${m.spouse_2} (${m.date_of_marriage}) at ${m.place_of_marriage}`,
  );
}

console.log("\nSeed complete!");
console.log("  5 birth registrations");
console.log("  2 death registrations");
console.log("  3 marriage registrations");
