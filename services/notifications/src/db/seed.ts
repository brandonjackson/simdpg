import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import { db, ensureTables } from "./index.js";
import { notifications } from "./schema.js";

ensureTables();

const count = db
  .select({ count: sql<number>`COUNT(*)` })
  .from(notifications)
  .get();

if (count && count.count > 0) {
  console.log(`Database already has ${count.count} notifications — skipping seed.`);
  process.exit(0);
}

console.log("Seeding notifications database...");

const now = new Date().toISOString();

const citizenIds = [
  "c1000000-0000-4000-8000-000000000001",
  "c1000000-0000-4000-8000-000000000002",
  "c1000000-0000-4000-8000-000000000003",
  "c1000000-0000-4000-8000-000000000004",
  "c1000000-0000-4000-8000-000000000005",
];

const seedNotifications = [
  {
    id: uuidv4(),
    citizen_id: citizenIds[0],
    channel: "email" as const,
    destination: "amara.okafor@simmail.gov",
    subject: "Birth Registration Confirmed",
    body: "The birth of Zara Okafor has been successfully registered. Registration reference: BR-2025-001.",
    source_service: "civil-registry",
    source_event: "birth.registered",
    status: "delivered" as const,
    attempts: 1,
    sent_at: "2025-01-15T10:05:00.000Z",
    delivered_at: "2025-01-15T10:05:02.000Z",
    failed_reason: null,
    created_at: "2025-01-15T10:05:00.000Z",
    updated_at: "2025-01-15T10:05:02.000Z",
  },
  {
    id: uuidv4(),
    citizen_id: citizenIds[0],
    channel: "sms" as const,
    destination: "+1-555-0101",
    subject: null,
    body: "SimDPG: Birth of Zara Okafor registered. Ref: BR-2025-001.",
    source_service: "civil-registry",
    source_event: "birth.registered",
    status: "delivered" as const,
    attempts: 1,
    sent_at: "2025-01-15T10:05:00.000Z",
    delivered_at: "2025-01-15T10:05:01.000Z",
    failed_reason: null,
    created_at: "2025-01-15T10:05:00.000Z",
    updated_at: "2025-01-15T10:05:01.000Z",
  },
  {
    id: uuidv4(),
    citizen_id: citizenIds[2],
    channel: "email" as const,
    destination: "tariq.hassan@simmail.gov",
    subject: "Benefit Enrollment Confirmation",
    body: "You have been enrolled in the Senior Pension programme. Monthly payments of SIM 500.00 will begin on 2025-02-01.",
    source_service: "benefits",
    source_event: "enrollment.created",
    status: "delivered" as const,
    attempts: 1,
    sent_at: "2025-01-10T08:05:00.000Z",
    delivered_at: "2025-01-10T08:05:03.000Z",
    failed_reason: null,
    created_at: "2025-01-10T08:05:00.000Z",
    updated_at: "2025-01-10T08:05:03.000Z",
  },
  {
    id: uuidv4(),
    citizen_id: citizenIds[1],
    channel: "email" as const,
    destination: "kofi.okafor@simmail.gov",
    subject: "Vaccination Appointment Reminder",
    body: "Reminder: You have a vaccination appointment scheduled for 2025-04-01 at Simville Health Centre.",
    source_service: "health",
    source_event: "vaccination.reminder",
    status: "sent" as const,
    attempts: 1,
    sent_at: "2025-03-25T09:00:00.000Z",
    delivered_at: null,
    failed_reason: null,
    created_at: "2025-03-25T09:00:00.000Z",
    updated_at: "2025-03-25T09:00:00.000Z",
  },
  {
    id: uuidv4(),
    citizen_id: citizenIds[3],
    channel: "sms" as const,
    destination: "+1-555-0303",
    subject: null,
    body: "SimDPG: Your benefit payment of SIM 150.00 has been scheduled for 2025-04-01.",
    source_service: "benefits",
    source_event: "payment.scheduled",
    status: "failed" as const,
    attempts: 3,
    sent_at: null,
    delivered_at: null,
    failed_reason: "Destination unreachable after 3 attempts",
    created_at: "2025-03-28T14:00:00.000Z",
    updated_at: "2025-03-28T14:30:00.000Z",
  },
  {
    id: uuidv4(),
    citizen_id: citizenIds[4],
    channel: "email" as const,
    destination: "nia.mensah@simmail.gov",
    subject: "Maternity Grant Approved",
    body: "Congratulations! Your application for the Maternity Grant has been approved. A one-time payment of SIM 1,000.00 will be processed shortly.",
    source_service: "benefits",
    source_event: "enrollment.created",
    status: "delivered" as const,
    attempts: 1,
    sent_at: "2025-03-20T11:05:00.000Z",
    delivered_at: "2025-03-20T11:05:04.000Z",
    failed_reason: null,
    created_at: "2025-03-20T11:05:00.000Z",
    updated_at: "2025-03-20T11:05:04.000Z",
  },
];

for (const n of seedNotifications) {
  db.insert(notifications).values(n).run();
  console.log(`  Created notification: ${n.channel} to ${n.destination} (${n.status})`);
}

console.log("\nSeed complete!");
