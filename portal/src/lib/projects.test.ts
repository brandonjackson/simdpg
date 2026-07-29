import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

let tempDir: string;
const origDbFile = process.env.PORTAL_DB_FILE;
const origSimDataDir = process.env.SIM_DATA_DIR;

// The db module opens its connection from PORTAL_DB_FILE on first use, so each
// test points it at a fresh temp file and resets the module registry before
// dynamically importing the store (the cached connection lives in module state).
beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "simdpg-projects-test-"));
  process.env.PORTAL_DB_FILE = path.join(tempDir, "test.sqlite");
  process.env.SIM_DATA_DIR = tempDir;
  vi.resetModules();
});

afterEach(async () => {
  if (origDbFile === undefined) delete process.env.PORTAL_DB_FILE;
  else process.env.PORTAL_DB_FILE = origDbFile;
  if (origSimDataDir === undefined) delete process.env.SIM_DATA_DIR;
  else process.env.SIM_DATA_DIR = origSimDataDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function loadProjects() {
  return import("./projects");
}

async function loadFormWebhooks() {
  return import("./form-webhooks");
}

describe("bootstrap", () => {
  it("creates a single default project on a fresh database", async () => {
    const projects = await loadProjects();
    const list = await projects.listProjects();

    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);
    expect(list[0].id).toBe("default");
    expect(await projects.defaultProjectId()).toBe("default");
  });
});

describe("createProject", () => {
  it("adds a project that is not the default and starts empty", async () => {
    const projects = await loadProjects();
    const created = await projects.createProject({ name: "Training run 3" });

    expect(created.name).toBe("Training run 3");
    expect(created.isDefault).toBe(false);
    expect(created.webhookCount).toBe(0);
    // The default project keeps live traffic until staff move it explicitly.
    expect(await projects.defaultProjectId()).toBe("default");
  });

  it("trims the name and rejects a blank one", async () => {
    const projects = await loadProjects();
    const created = await projects.createProject({ name: "  Spaced  " });
    expect(created.name).toBe("Spaced");

    await expect(projects.createProject({ name: "   " })).rejects.toThrow(
      "Project name is required",
    );
  });

  // Names are the only handle staff have on a project in a dropdown, so two
  // projects that read identically would be indistinguishable there.
  it("rejects a duplicate name regardless of case", async () => {
    const projects = await loadProjects();
    await projects.createProject({ name: "Clone A" });

    await expect(projects.createProject({ name: "clone a" })).rejects.toThrow(
      /already exists/,
    );
  });

  it("copies the source project's form webhooks when duplicating", async () => {
    const projects = await loadProjects();
    const hooks = await loadFormWebhooks();

    await hooks.setFormWebhook("default", "national-id", "http://a/national-id");
    await hooks.setFormWebhook("default", "marriage-registration", "http://a/marriage");

    const copy = await projects.createProject({
      name: "Clone of default",
      duplicateOf: "default",
    });

    expect(copy.webhookCount).toBe(2);
    const copied = await hooks.listFormWebhooks(copy.id);
    expect(
      copied.map((r) => [r.key, r.target_url]).sort(),
    ).toEqual([
      ["marriage-registration", "http://a/marriage"],
      ["national-id", "http://a/national-id"],
    ]);

    // The copies are independent: editing one leaves the other alone.
    await hooks.setFormWebhook(copy.id, "national-id", "http://b/national-id");
    const original = await hooks.listFormWebhooks("default");
    expect(
      original.find((r) => r.key === "national-id")?.target_url,
    ).toBe("http://a/national-id");
  });

  it("does not inherit the source project's description when duplicating", async () => {
    const projects = await loadProjects();
    const copy = await projects.createProject({
      name: "Copy",
      duplicateOf: "default",
    });

    expect(copy.description).toBeNull();
  });

  it("rejects duplicating a project that doesn't exist", async () => {
    const projects = await loadProjects();
    await expect(
      projects.createProject({ name: "Orphan", duplicateOf: "nope" }),
    ).rejects.toThrow(/no longer exists/);
  });
});

describe("updateProject", () => {
  it("renames a project and leaves its registrations in place", async () => {
    const projects = await loadProjects();
    const hooks = await loadFormWebhooks();
    const project = await projects.createProject({ name: "Before" });
    await hooks.setFormWebhook(project.id, "national-id", "http://x/national-id");

    const renamed = await projects.updateProject(project.id, { name: "After" });

    expect(renamed?.name).toBe("After");
    expect(renamed?.webhookCount).toBe(1);
    expect(await hooks.listFormWebhooks(project.id)).toHaveLength(1);
  });

  it("allows a rename that only changes case of its own name", async () => {
    const projects = await loadProjects();
    const project = await projects.createProject({ name: "Clone a" });

    const renamed = await projects.updateProject(project.id, { name: "CLONE A" });
    expect(renamed?.name).toBe("CLONE A");
  });

  it("rejects renaming onto another project's name", async () => {
    const projects = await loadProjects();
    await projects.createProject({ name: "Taken" });
    const other = await projects.createProject({ name: "Free" });

    await expect(
      projects.updateProject(other.id, { name: "Taken" }),
    ).rejects.toThrow(/already exists/);
  });

  it("moves the default flag so exactly one project holds it", async () => {
    const projects = await loadProjects();
    const project = await projects.createProject({ name: "New live project" });

    await projects.updateProject(project.id, { isDefault: true });

    const list = await projects.listProjects();
    expect(list.filter((p) => p.isDefault).map((p) => p.id)).toEqual([project.id]);
    expect(await projects.defaultProjectId()).toBe(project.id);
    // Default first, so the picker's initial option is the live one.
    expect(list[0].id).toBe(project.id);
  });

  it("refuses to leave no default at all", async () => {
    const projects = await loadProjects();
    await expect(
      projects.updateProject("default", { isDefault: false }),
    ).rejects.toThrow(/another project as the default/);
  });

  it("returns null for a project that doesn't exist", async () => {
    const projects = await loadProjects();
    expect(await projects.updateProject("nope", { name: "x" })).toBeNull();
  });
});

describe("deleteProject", () => {
  it("deletes the project and its form webhooks", async () => {
    const projects = await loadProjects();
    const hooks = await loadFormWebhooks();
    const project = await projects.createProject({ name: "Doomed" });
    await hooks.setFormWebhook(project.id, "national-id", "http://x/national-id");

    expect(await projects.deleteProject(project.id)).toMatchObject({
      deleted: true,
    });
    expect(await projects.getProject(project.id)).toBeNull();
    expect(await hooks.listFormWebhooks(project.id)).toEqual([]);
  });

  // Live portal form submissions resolve through the default project, so the
  // set can never be empty.
  it("refuses to delete the last remaining project", async () => {
    const projects = await loadProjects();
    await expect(projects.deleteProject("default")).rejects.toThrow(
      /last project can't be deleted/,
    );
  });

  it("promotes another project when the default is deleted", async () => {
    const projects = await loadProjects();
    const heir = await projects.createProject({ name: "Heir" });

    const result = await projects.deleteProject("default");

    expect(result?.newDefaultId).toBe(heir.id);
    expect(await projects.defaultProjectId()).toBe(heir.id);
  });

  it("returns null for a project that doesn't exist", async () => {
    const projects = await loadProjects();
    expect(await projects.deleteProject("nope")).toBeNull();
  });
});
