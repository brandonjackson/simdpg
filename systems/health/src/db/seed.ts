/**
 * Seed script — creates 5 patients, 10 encounters, and 8 vaccinations.
 * Run: npx tsx src/db/seed.ts  (from systems/health/)
 */
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import { patients, encounters, vaccinations } from "./schema.js";

ensureTables();

// Check if data already exists
const count = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(patients)
  .get();

if (count && count.count > 0) {
  console.log(`Database already has ${count.count} patients — skipping seed.`);
  process.exit(0);
}

console.log("Seeding health database...");

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

interface SeedPatient {
  id: string;
  citizen_id: string;
  blood_type: string | null;
  allergies: string | null;
}

const seedPatients: SeedPatient[] = [
  {
    id: uuidv4(),
    citizen_id: "c1a00001-0000-4000-a000-000000000001",
    blood_type: "O+",
    allergies: JSON.stringify(["Penicillin"]),
  },
  {
    id: uuidv4(),
    citizen_id: "c1a00001-0000-4000-a000-000000000002",
    blood_type: "A-",
    allergies: null,
  },
  {
    id: uuidv4(),
    citizen_id: "c1a00001-0000-4000-a000-000000000003",
    blood_type: "B+",
    allergies: JSON.stringify(["Sulfa", "Latex"]),
  },
  {
    id: uuidv4(),
    citizen_id: "c1a00001-0000-4000-a000-000000000004",
    blood_type: "AB+",
    allergies: null,
  },
  {
    id: uuidv4(),
    citizen_id: "c1a00001-0000-4000-a000-000000000005",
    blood_type: null,
    allergies: JSON.stringify(["Aspirin"]),
  },
];

for (const p of seedPatients) {
  db.insert(patients)
    .values({
      id: p.id,
      citizen_id: p.citizen_id,
      blood_type: p.blood_type,
      allergies: p.allergies,
      registered_at: now,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .run();

  console.log(`  Created patient: ${p.id} (citizen ${p.citizen_id})`);
}

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

interface SeedEncounter {
  id: string;
  patient_index: number;
  type: "checkup" | "emergency" | "vaccination" | "consultation";
  date: string;
  facility: string;
  provider: string;
  diagnosis: string | null;
  notes: string | null;
  status: "completed" | "scheduled" | "cancelled";
}

const seedEncounters: SeedEncounter[] = [
  {
    id: uuidv4(),
    patient_index: 0,
    type: "checkup",
    date: "2025-01-15",
    facility: "Simville General Hospital",
    provider: "Dr. Nkosi",
    diagnosis: "Routine wellness exam — no concerns",
    notes: null,
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 0,
    type: "vaccination",
    date: "2025-02-10",
    facility: "Simville Health Centre",
    provider: "Nurse Adjei",
    diagnosis: null,
    notes: "BCG vaccination administered",
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 1,
    type: "emergency",
    date: "2025-03-05",
    facility: "Laketown Emergency Unit",
    provider: "Dr. Patel",
    diagnosis: "Acute appendicitis",
    notes: "Referred for surgical evaluation",
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 1,
    type: "consultation",
    date: "2025-04-01",
    facility: "Laketown Specialist Clinic",
    provider: "Dr. Mensah",
    diagnosis: "Post-surgical follow-up — healing well",
    notes: null,
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 2,
    type: "vaccination",
    date: "2025-01-20",
    facility: "Oldtown Community Clinic",
    provider: "Nurse Fatima",
    diagnosis: null,
    notes: "OPV dose 1 administered",
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 2,
    type: "vaccination",
    date: "2025-03-20",
    facility: "Oldtown Community Clinic",
    provider: "Nurse Fatima",
    diagnosis: null,
    notes: "OPV dose 2 administered",
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 3,
    type: "checkup",
    date: "2025-02-28",
    facility: "Greenfield Medical Center",
    provider: "Dr. Okafor",
    diagnosis: "Mild hypertension — lifestyle counseling provided",
    notes: "Follow-up in 3 months",
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 3,
    type: "consultation",
    date: "2025-05-28",
    facility: "Greenfield Medical Center",
    provider: "Dr. Okafor",
    diagnosis: "Hypertension follow-up — improving",
    notes: null,
    status: "scheduled",
  },
  {
    id: uuidv4(),
    patient_index: 4,
    type: "vaccination",
    date: "2025-04-10",
    facility: "Simville Health Centre",
    provider: "Nurse Adjei",
    diagnosis: null,
    notes: "Measles vaccine dose 1",
    status: "completed",
  },
  {
    id: uuidv4(),
    patient_index: 4,
    type: "checkup",
    date: "2025-05-15",
    facility: "Simville General Hospital",
    provider: "Dr. Nkosi",
    diagnosis: "Routine exam — healthy",
    notes: null,
    status: "completed",
  },
];

for (const e of seedEncounters) {
  db.insert(encounters)
    .values({
      id: e.id,
      patient_id: seedPatients[e.patient_index].id,
      type: e.type,
      date: e.date,
      facility: e.facility,
      provider: e.provider,
      diagnosis: e.diagnosis,
      notes: e.notes,
      status: e.status,
      created_at: now,
      updated_at: now,
    })
    .run();

  console.log(`  Created encounter: ${e.type} on ${e.date} at ${e.facility}`);
}

// ---------------------------------------------------------------------------
// Vaccinations
// ---------------------------------------------------------------------------

interface SeedVaccination {
  id: string;
  patient_index: number;
  encounter_index: number | null;
  vaccine_name: string;
  dose_number: number;
  date_administered: string;
  next_dose_due: string | null;
  batch_number: string;
}

const seedVaccinations: SeedVaccination[] = [
  {
    id: uuidv4(),
    patient_index: 0,
    encounter_index: 1, // BCG vaccination encounter
    vaccine_name: "BCG",
    dose_number: 1,
    date_administered: "2025-02-10",
    next_dose_due: null, // BCG is typically single dose
    batch_number: "BCG-2025-A001",
  },
  {
    id: uuidv4(),
    patient_index: 0,
    encounter_index: null,
    vaccine_name: "DPT",
    dose_number: 1,
    date_administered: "2025-01-05",
    next_dose_due: "2025-03-05", // overdue if not followed up
    batch_number: "DPT-2025-B042",
  },
  {
    id: uuidv4(),
    patient_index: 2,
    encounter_index: 4, // OPV dose 1 encounter
    vaccine_name: "OPV",
    dose_number: 1,
    date_administered: "2025-01-20",
    next_dose_due: "2025-03-20",
    batch_number: "OPV-2025-C101",
  },
  {
    id: uuidv4(),
    patient_index: 2,
    encounter_index: 5, // OPV dose 2 encounter
    vaccine_name: "OPV",
    dose_number: 2,
    date_administered: "2025-03-20",
    next_dose_due: "2025-05-20",
    batch_number: "OPV-2025-C102",
  },
  {
    id: uuidv4(),
    patient_index: 2,
    encounter_index: null,
    vaccine_name: "Measles",
    dose_number: 1,
    date_administered: "2025-02-15",
    next_dose_due: "2025-08-15",
    batch_number: "MEA-2025-D200",
  },
  {
    id: uuidv4(),
    patient_index: 3,
    encounter_index: null,
    vaccine_name: "DPT",
    dose_number: 1,
    date_administered: "2025-01-10",
    next_dose_due: "2025-03-10", // overdue if not followed up
    batch_number: "DPT-2025-B043",
  },
  {
    id: uuidv4(),
    patient_index: 4,
    encounter_index: 8, // Measles vaccine encounter
    vaccine_name: "Measles",
    dose_number: 1,
    date_administered: "2025-04-10",
    next_dose_due: "2025-10-10",
    batch_number: "MEA-2025-D201",
  },
  {
    id: uuidv4(),
    patient_index: 1,
    encounter_index: null,
    vaccine_name: "Hepatitis B",
    dose_number: 1,
    date_administered: "2025-02-20",
    next_dose_due: "2025-04-20", // overdue if not followed up
    batch_number: "HBV-2025-E050",
  },
];

for (const v of seedVaccinations) {
  db.insert(vaccinations)
    .values({
      id: v.id,
      patient_id: seedPatients[v.patient_index].id,
      encounter_id:
        v.encounter_index !== null
          ? seedEncounters[v.encounter_index].id
          : null,
      vaccine_name: v.vaccine_name,
      dose_number: v.dose_number,
      date_administered: v.date_administered,
      next_dose_due: v.next_dose_due,
      batch_number: v.batch_number,
      created_at: now,
      updated_at: now,
    })
    .run();

  console.log(
    `  Created vaccination: ${v.vaccine_name} dose ${v.dose_number} for patient ${seedPatients[v.patient_index].id}`,
  );
}

console.log("\nSeed complete!");
console.log("  5 patients, 10 encounters, 8 vaccinations created.");
