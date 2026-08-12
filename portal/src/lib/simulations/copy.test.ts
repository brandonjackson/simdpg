import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SimulationParameters, SimulationRecord } from "./store";
import { GENERATOR_CONFIG } from "./generators/config";
import { BEHAVIOR_OFF } from "@simdpg/system-kit/behavior";

const PARAMS: SimulationParameters = {
  clockSpeed: 60,
  durationSeconds: 120,
  usesExistingPopulation: true,
  generatorConfig: GENERATOR_CONFIG,
  behavior: BEHAVIOR_OFF,
  projectId: "default",
  projectName: "Default project",
};

/** A simulation record standing in for the copy source; only its parameters matter. */
function sourceWith(parameters: Partial<SimulationParameters>): SimulationRecord {
  return {
    id: "source-1",
    createdAt: "t0",
    updatedAt: "t0",
    status: "completed",
    parameters: { ...PARAMS, ...parameters },
  };
}

let tempDir: string;
const origDbFile = process.env.PORTAL_DB_FILE;
const origSimDataDir = process.env.SIM_DATA_DIR;

// The db module opens its connection from PORTAL_DB_FILE on first use, so each
// test points it at a fresh temp file (bootstrapped with the default project) and
// resets the module registry before importing.
beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "simdpg-copy-test-"));
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

async function loadCopy() {
  return import("./copy");
}

describe("resolveCopyProject", () => {
  it("follows the source's project, so a re-run lands where the original did", async () => {
    const { resolveCopyProject } = await loadCopy();
    const { createProject } = await import("@/lib/projects");
    const other = await createProject({ name: "Training run 3" });

    const target = await resolveCopyProject(sourceWith({ projectId: other.id }));

    expect("project" in target && target.project.id).toBe(other.id);
    expect("project" in target && target.project.name).toBe("Training run 3");
  });

  it("picks up the project's current name, so a rename is reflected in the copy", async () => {
    const { resolveCopyProject } = await loadCopy();
    const { createProject, updateProject } = await import("@/lib/projects");
    const project = await createProject({ name: "Old name" });
    await updateProject(project.id, { name: "New name" });

    const target = await resolveCopyProject(
      sourceWith({ projectId: project.id, projectName: "Old name" }),
    );

    expect("project" in target && target.project.name).toBe("New name");
  });

  // Falling back to the default project would post the copy's results to an
  // OpenFn instance nobody chose, so this is refused instead.
  it("refuses a source whose project has been deleted", async () => {
    const { resolveCopyProject } = await loadCopy();
    const { createProject, deleteProject } = await import("@/lib/projects");
    const doomed = await createProject({ name: "Retired project" });
    await deleteProject(doomed.id);

    const target = await resolveCopyProject(
      sourceWith({ projectId: doomed.id, projectName: "Retired project" }),
    );

    expect("error" in target).toBe(true);
    expect("error" in target && target.error).toContain("Retired project");
    expect("error" in target && target.error).toContain("no longer exists");
  });

  it("falls back to the default project for a record that predates projects", async () => {
    const { resolveCopyProject } = await loadCopy();
    const target = await resolveCopyProject(
      sourceWith({ projectId: "", projectName: "" }),
    );

    expect("project" in target && target.project.id).toBe("default");
    expect("project" in target && target.project.isDefault).toBe(true);
  });

  it("honours an explicitly requested project over the source's", async () => {
    const { resolveCopyProject } = await loadCopy();
    const { createProject } = await import("@/lib/projects");
    const elsewhere = await createProject({ name: "Somewhere else" });

    const target = await resolveCopyProject(
      sourceWith({ projectId: "default" }),
      elsewhere.id,
    );

    expect("project" in target && target.project.id).toBe(elsewhere.id);
  });

  it("rejects an unknown requested project rather than defaulting it", async () => {
    const { resolveCopyProject } = await loadCopy();
    const target = await resolveCopyProject(sourceWith({}), "no-such-project");

    expect("error" in target && target.error).toBe("Unknown project");
  });

  it("treats a blank requested project as none given", async () => {
    const { resolveCopyProject } = await loadCopy();
    const target = await resolveCopyProject(sourceWith({ projectId: "default" }), "  ");

    expect("project" in target && target.project.id).toBe("default");
  });
});
