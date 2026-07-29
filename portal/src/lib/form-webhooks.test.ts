import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";

let tempDir: string;
let dbFile: string;
const origDbFile = process.env.PORTAL_DB_FILE;
const origSimDataDir = process.env.SIM_DATA_DIR;
const origNationalIdEnv = process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "simdpg-form-hooks-test-"));
  dbFile = path.join(tempDir, "test.sqlite");
  process.env.PORTAL_DB_FILE = dbFile;
  process.env.SIM_DATA_DIR = tempDir;
  delete process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL;
  vi.resetModules();
});

afterEach(async () => {
  if (origDbFile === undefined) delete process.env.PORTAL_DB_FILE;
  else process.env.PORTAL_DB_FILE = origDbFile;
  if (origSimDataDir === undefined) delete process.env.SIM_DATA_DIR;
  else process.env.SIM_DATA_DIR = origSimDataDir;
  if (origNationalIdEnv === undefined) {
    delete process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL;
  } else {
    process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL = origNationalIdEnv;
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function load() {
  const [hooks, projects] = await Promise.all([
    import("./form-webhooks"),
    import("./projects"),
  ]);
  return { ...hooks, ...projects };
}

describe("project-scoped registrations", () => {
  it("keeps each project's URL for the same form separate", async () => {
    const lib = await load();
    const other = await lib.createProject({ name: "Clone" });

    await lib.setFormWebhook("default", "national-id", "http://a/national-id");
    await lib.setFormWebhook(other.id, "national-id", "http://b/national-id");

    expect((await lib.resolveFormWebhook("national-id", "default"))?.url).toBe(
      "http://a/national-id",
    );
    expect((await lib.resolveFormWebhook("national-id", other.id))?.url).toBe(
      "http://b/national-id",
    );
  });

  it("overwrites a URL within a project rather than adding a second row", async () => {
    const lib = await load();
    await lib.setFormWebhook("default", "national-id", "http://one");
    await lib.setFormWebhook("default", "national-id", "http://two");

    const rows = await lib.listFormWebhooks("default");
    expect(rows).toHaveLength(1);
    expect(rows[0].target_url).toBe("http://two");
  });

  it("deletes only the named project's registration", async () => {
    const lib = await load();
    const other = await lib.createProject({ name: "Clone" });
    await lib.setFormWebhook("default", "national-id", "http://a");
    await lib.setFormWebhook(other.id, "national-id", "http://b");

    await lib.deleteFormWebhook(other.id, "national-id");

    expect(await lib.listFormWebhooks(other.id)).toEqual([]);
    expect((await lib.resolveFormWebhook("national-id", "default"))?.url).toBe(
      "http://a",
    );
  });

  it("defaults to the default project when none is named", async () => {
    const lib = await load();
    await lib.setFormWebhook("default", "national-id", "http://live");

    // Live citizen-facing submissions call resolveFormWebhook with no project.
    expect((await lib.resolveFormWebhook("national-id"))?.url).toBe("http://live");
    expect(await lib.listFormWebhooks()).toHaveLength(1);
  });
});

describe("legacy env-var fallback", () => {
  it("applies to the default project when nothing is registered", async () => {
    process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL = "http://legacy/national-id";
    const lib = await load();

    expect(await lib.resolveFormWebhook("national-id", "default")).toEqual({
      url: "http://legacy/national-id",
      source: "env",
    });
  });

  it("is overridden by a registered URL", async () => {
    process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL = "http://legacy/national-id";
    const lib = await load();
    await lib.setFormWebhook("default", "national-id", "http://registered");

    expect(await lib.resolveFormWebhook("national-id", "default")).toEqual({
      url: "http://registered",
      source: "registry",
    });
  });

  // A project exists to name its own endpoints. Borrowing the legacy env var
  // would quietly send a second project's traffic to the first one's workflows.
  it("does not apply to non-default projects", async () => {
    process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL = "http://legacy/national-id";
    const lib = await load();
    const other = await lib.createProject({ name: "Clone" });

    expect(await lib.resolveFormWebhook("national-id", other.id)).toBeNull();
  });

  it("follows the default flag when it moves to another project", async () => {
    process.env.OPENFN_NATIONAL_ID_WEBHOOK_URL = "http://legacy/national-id";
    const lib = await load();
    const other = await lib.createProject({ name: "New live project" });
    await lib.updateProject(other.id, { isDefault: true });

    expect((await lib.resolveFormWebhook("national-id", other.id))?.source).toBe(
      "env",
    );
    expect(await lib.resolveFormWebhook("national-id", "default")).toBeNull();
  });
});

describe("migration from the pre-projects schema", () => {
  it("moves existing registrations onto the default project", async () => {
    // A database as an earlier release left it: form_webhooks keyed by form only.
    const legacy = new Database(dbFile);
    legacy.exec(`
      CREATE TABLE form_webhooks (
        key        TEXT PRIMARY KEY,
        target_url TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO form_webhooks (key, target_url, updated_at)
        VALUES ('national-id', 'http://existing/national-id', '2026-01-01T00:00:00.000Z');
    `);
    legacy.close();

    const lib = await load();

    const rows = await lib.listFormWebhooks("default");
    expect(rows).toEqual([
      {
        project_id: "default",
        key: "national-id",
        target_url: "http://existing/national-id",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    // And the registration still resolves for live submissions.
    expect((await lib.resolveFormWebhook("national-id"))?.url).toBe(
      "http://existing/national-id",
    );
  });
});
