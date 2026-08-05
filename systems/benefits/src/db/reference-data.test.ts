import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";
import { programs } from "./schema.js";
import {
  PROGRAM_IDS,
  REFERENCE_PROGRAMS,
  ensureReferencePrograms,
} from "./reference-data.js";

/**
 * These run against a throwaway in-memory database rather than the system's
 * SQLite file, so the assertions are about the logic and never touch real data.
 */
function freshDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE programs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      eligibility_rules TEXT NOT NULL,
      payment_amount REAL NOT NULL,
      payment_frequency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

function programCount(db: ReturnType<typeof freshDb>): number {
  return db.select({ c: sql<number>`count(*)` }).from(programs).get()?.c ?? 0;
}

describe("REFERENCE_PROGRAMS", () => {
  it("uses stable IDs that integrations can hard-code", () => {
    // The whole point of the module: these must not drift between seeds.
    expect(REFERENCE_PROGRAMS.map((p) => p.id)).toEqual([
      "b1000000-0000-4000-8000-000000000001",
      "b1000000-0000-4000-8000-000000000002",
      "b1000000-0000-4000-8000-000000000003",
      "b1000000-0000-4000-8000-000000000004",
    ]);
  });

  it("uses IDs that satisfy the uuid check on /eligibility/check", () => {
    const uuidV4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const p of REFERENCE_PROGRAMS) {
      expect(p.id, p.name).toMatch(uuidV4);
    }
  });

  it("has no duplicate IDs or names", () => {
    expect(new Set(REFERENCE_PROGRAMS.map((p) => p.id)).size).toBe(
      REFERENCE_PROGRAMS.length,
    );
    expect(
      new Set(REFERENCE_PROGRAMS.map((p) => p.name.toLowerCase())).size,
    ).toBe(REFERENCE_PROGRAMS.length);
  });

  it("includes an active child protection programme", () => {
    const cp = REFERENCE_PROGRAMS.find(
      (p) => p.id === PROGRAM_IDS.childProtection,
    );
    expect(cp).toBeDefined();
    expect(cp!.name).toBe("Child Protection Support");
    expect(cp!.status).toBe("active");
  });
});

describe("ensureReferencePrograms", () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
  });

  it("creates every programme in an empty database", () => {
    const created = ensureReferencePrograms(db);

    expect(created).toHaveLength(REFERENCE_PROGRAMS.length);
    expect(programCount(db)).toBe(REFERENCE_PROGRAMS.length);
  });

  it("is idempotent — a second call adds nothing", () => {
    ensureReferencePrograms(db);
    const second = ensureReferencePrograms(db);

    expect(second).toEqual([]);
    expect(programCount(db)).toBe(REFERENCE_PROGRAMS.length);
  });

  it("restores programmes after the table is emptied", () => {
    // This is the failure that took the live sandbox down: the table went empty
    // and the one-shot seed never ran again.
    ensureReferencePrograms(db);
    db.delete(programs).run();
    expect(programCount(db)).toBe(0);

    const restored = ensureReferencePrograms(db);

    expect(restored).toHaveLength(REFERENCE_PROGRAMS.length);
    expect(programCount(db)).toBe(REFERENCE_PROGRAMS.length);
  });

  it("stores eligibility_rules as JSON the API can parse back", () => {
    ensureReferencePrograms(db);

    const row = db
      .select()
      .from(programs)
      .all()
      .find((p) => p.id === PROGRAM_IDS.childProtection);

    expect(JSON.parse(row!.eligibility_rules)).toEqual({
      max_age: 18,
      requires_referral: true,
      vulnerability_indicators: ["single_parent", "dependents"],
    });
  });

  it("does not overwrite a programme that already exists", () => {
    const now = new Date().toISOString();
    db.insert(programs)
      .values({
        id: PROGRAM_IDS.childBenefit,
        name: "Child Benefit",
        description: "Locally edited description",
        eligibility_rules: JSON.stringify({ max_age: 21 }),
        payment_amount: 999,
        payment_frequency: "monthly",
        status: "suspended",
        created_at: now,
        updated_at: now,
      })
      .run();

    ensureReferencePrograms(db);

    const row = db
      .select()
      .from(programs)
      .all()
      .find((p) => p.id === PROGRAM_IDS.childBenefit);

    expect(row!.description).toBe("Locally edited description");
    expect(row!.payment_amount).toBe(999);
    expect(row!.status).toBe("suspended");
  });

  it("does not duplicate a programme that exists under a legacy random ID", () => {
    // Databases seeded before the IDs were stabilised hold "Child Benefit"
    // under a uuidv4. It should stay as-is, not gain a stable-ID twin.
    const now = new Date().toISOString();
    db.insert(programs)
      .values({
        id: "9b46e306-78da-4503-bd16-03540c69b977",
        name: "Child Benefit",
        description: "Seeded before IDs were stable",
        eligibility_rules: JSON.stringify({ max_age: 18 }),
        payment_amount: 150,
        payment_frequency: "monthly",
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .run();

    const created = ensureReferencePrograms(db);

    expect(created).not.toContain("Child Benefit");
    expect(
      db
        .select()
        .from(programs)
        .all()
        .filter((p) => p.name === "Child Benefit"),
    ).toHaveLength(1);
  });
});
