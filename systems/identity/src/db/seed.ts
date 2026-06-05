/**
 * Seed script — creates 10 sample citizens, addresses, and 3 households.
 * Run: npx tsx src/db/seed.ts  (from systems/identity/)
 */
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import { citizens, addresses, householdMembers } from "./schema.js";

ensureTables();

// Check if data already exists
const count = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(citizens)
  .get();

if (count && count.count > 0) {
  console.log(`Database already has ${count.count} citizens — skipping seed.`);
  process.exit(0);
}

console.log("Seeding identity database...");

// ---------------------------------------------------------------------------
// Citizens
// ---------------------------------------------------------------------------

interface SeedCitizen {
  id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: "male" | "female";
  email: string | null;
  phone_number: string | null;
}

const seedCitizens: SeedCitizen[] = [
  { id: uuidv4(), given_name: "Amara", family_name: "Okafor", date_of_birth: "1985-03-15", sex: "female", email: "amara.okafor@simmail.gov", phone_number: "+1-555-0101" },
  { id: uuidv4(), given_name: "Kofi", family_name: "Okafor", date_of_birth: "1983-07-22", sex: "male", email: "kofi.okafor@simmail.gov", phone_number: "+1-555-0102" },
  { id: uuidv4(), given_name: "Zara", family_name: "Okafor", date_of_birth: "2010-01-10", sex: "female", email: null, phone_number: null },
  { id: uuidv4(), given_name: "Liam", family_name: "Chen", date_of_birth: "1990-11-05", sex: "male", email: "liam.chen@simmail.gov", phone_number: "+1-555-0201" },
  { id: uuidv4(), given_name: "Mei", family_name: "Chen", date_of_birth: "1992-06-18", sex: "female", email: "mei.chen@simmail.gov", phone_number: "+1-555-0202" },
  { id: uuidv4(), given_name: "Tariq", family_name: "Hassan", date_of_birth: "1978-09-30", sex: "male", email: "tariq.hassan@simmail.gov", phone_number: "+1-555-0301" },
  { id: uuidv4(), given_name: "Fatima", family_name: "Hassan", date_of_birth: "1980-12-02", sex: "female", email: "fatima.hassan@simmail.gov", phone_number: "+1-555-0302" },
  { id: uuidv4(), given_name: "Omar", family_name: "Hassan", date_of_birth: "2005-04-14", sex: "male", email: null, phone_number: "+1-555-0303" },
  { id: uuidv4(), given_name: "Nia", family_name: "Mensah", date_of_birth: "1995-08-21", sex: "female", email: "nia.mensah@simmail.gov", phone_number: "+1-555-0401" },
  { id: uuidv4(), given_name: "Kwame", family_name: "Adjei", date_of_birth: "2000-02-28", sex: "male", email: "kwame.adjei@simmail.gov", phone_number: null },
];

const now = new Date().toISOString();

for (let i = 0; i < seedCitizens.length; i++) {
  const c = seedCitizens[i];
  const national_id = `SIM-${String(i + 1).padStart(6, "0")}`;

  db.insert(citizens)
    .values({
      id: c.id,
      national_id,
      given_name: c.given_name,
      family_name: c.family_name,
      date_of_birth: c.date_of_birth,
      sex: c.sex,
      email: c.email,
      phone_number: c.phone_number,
      status: "alive",
      created_at: now,
      updated_at: now,
    })
    .run();

  console.log(`  Created citizen: ${national_id} — ${c.given_name} ${c.family_name}`);
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

interface SeedAddress {
  citizen_index: number;
  type: "residential" | "mailing";
  line_1: string;
  line_2?: string;
  city: string;
  postal_code: string;
  from_date: string;
}

const seedAddresses: SeedAddress[] = [
  { citizen_index: 0, type: "residential", line_1: "12 Palm Avenue", city: "Simville", postal_code: "10001", from_date: "2015-01-01" },
  { citizen_index: 1, type: "residential", line_1: "12 Palm Avenue", city: "Simville", postal_code: "10001", from_date: "2015-01-01" },
  { citizen_index: 2, type: "residential", line_1: "12 Palm Avenue", city: "Simville", postal_code: "10001", from_date: "2015-01-01" },
  { citizen_index: 3, type: "residential", line_1: "88 River Road", line_2: "Apt 4B", city: "Laketown", postal_code: "20002", from_date: "2018-06-15" },
  { citizen_index: 4, type: "residential", line_1: "88 River Road", line_2: "Apt 4B", city: "Laketown", postal_code: "20002", from_date: "2018-06-15" },
  { citizen_index: 5, type: "residential", line_1: "7 Market Street", city: "Oldtown", postal_code: "30003", from_date: "2005-03-20" },
  { citizen_index: 6, type: "residential", line_1: "7 Market Street", city: "Oldtown", postal_code: "30003", from_date: "2005-03-20" },
  { citizen_index: 7, type: "residential", line_1: "7 Market Street", city: "Oldtown", postal_code: "30003", from_date: "2005-03-20" },
  { citizen_index: 8, type: "residential", line_1: "55 Hilltop Drive", city: "Simville", postal_code: "10005", from_date: "2020-09-01" },
  { citizen_index: 8, type: "mailing", line_1: "PO Box 321", city: "Simville", postal_code: "10099", from_date: "2020-09-01" },
  { citizen_index: 9, type: "residential", line_1: "3 Baobab Lane", city: "Greenfield", postal_code: "40004", from_date: "2022-01-15" },
];

for (const addr of seedAddresses) {
  db.insert(addresses)
    .values({
      id: uuidv4(),
      citizen_id: seedCitizens[addr.citizen_index].id,
      type: addr.type,
      line_1: addr.line_1,
      line_2: addr.line_2 ?? null,
      city: addr.city,
      postal_code: addr.postal_code,
      from_date: addr.from_date,
      to_date: null,
    })
    .run();
}

console.log(`  Created ${seedAddresses.length} addresses`);

// ---------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------

interface SeedHousehold {
  name: string;
  members: { citizen_index: number; relationship: "head" | "spouse" | "child" | "other" }[];
}

const seedHouseholds: SeedHousehold[] = [
  {
    name: "Okafor household",
    members: [
      { citizen_index: 1, relationship: "head" },
      { citizen_index: 0, relationship: "spouse" },
      { citizen_index: 2, relationship: "child" },
    ],
  },
  {
    name: "Chen household",
    members: [
      { citizen_index: 3, relationship: "head" },
      { citizen_index: 4, relationship: "spouse" },
    ],
  },
  {
    name: "Hassan household",
    members: [
      { citizen_index: 5, relationship: "head" },
      { citizen_index: 6, relationship: "spouse" },
      { citizen_index: 7, relationship: "child" },
    ],
  },
];

for (const hh of seedHouseholds) {
  const householdId = uuidv4();
  for (const m of hh.members) {
    db.insert(householdMembers)
      .values({
        id: uuidv4(),
        household_id: householdId,
        citizen_id: seedCitizens[m.citizen_index].id,
        relationship: m.relationship,
        from_date: "2024-01-01",
        to_date: null,
      })
      .run();
  }
  console.log(`  Created household: ${hh.name} (${hh.members.length} members)`);
}

console.log("\nSeed complete!");
