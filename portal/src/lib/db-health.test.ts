import { describe, it, expect } from "vitest";
import type { DbHealthReport } from "@simdpg/system-kit/db-health";
import {
  summarize,
  toServiceHealth,
  type ServiceDbHealth,
  type ServiceDescriptor,
} from "./db-health";

const IDENTITY: ServiceDescriptor = {
  key: "identity",
  label: "Identity",
  workspace: "@simdpg/identity",
  volume: "/app/systems/identity/data",
  url: "http://identity.railway.internal:8080",
  repair: "npm run db:seed -w @simdpg/identity",
};

function report(overrides: Partial<DbHealthReport> = {}): DbHealthReport {
  return {
    service: "identity",
    status: "ok",
    file: "/app/systems/identity/data/identity.sqlite",
    writable: true,
    checkedAt: "2026-01-01T00:00:00.000Z",
    problems: [],
    missingTables: [],
    missingColumns: [],
    counts: { citizens: 10 },
    ...overrides,
  };
}

function service(overrides: Partial<ServiceDbHealth> = {}): ServiceDbHealth {
  return {
    key: "identity",
    label: "Identity",
    workspace: "@simdpg/identity",
    status: "ok",
    severity: "ok",
    problems: [],
    commands: [],
    hints: [],
    ...overrides,
  };
}

describe("toServiceHealth", () => {
  it("passes a healthy database through with nothing to do", () => {
    const health = toServiceHealth(IDENTITY, report());
    expect(health.severity).toBe("ok");
    expect(health.commands).toEqual([]);
  });

  it("gives the seed command for a broken schema", () => {
    const health = toServiceHealth(
      IDENTITY,
      report({
        status: "error",
        problems: ["Missing tables: citizens."],
        missingTables: ["citizens"],
      }),
    );
    expect(health.severity).toBe("error");
    expect(health.commands).toEqual(["npm run db:seed -w @simdpg/identity"]);
    expect(health.problems).toEqual(["Missing tables: citizens."]);
  });

  it("names the volume mount when the file is not writable", () => {
    const health = toServiceHealth(
      IDENTITY,
      report({ status: "error", writable: false, problems: ["not writable"] }),
    );
    expect(health.hints.join(" ")).toContain("/app/systems/identity/data");
  });

  it("says a missing column may need a migration in code", () => {
    const health = toServiceHealth(
      IDENTITY,
      report({
        status: "error",
        problems: ["Missing columns: citizens.email."],
        missingColumns: ["citizens.email"],
      }),
    );
    expect(health.hints.join(" ")).toContain("ensureColumn");
  });

  it("treats an empty database as a warning, not a breakage", () => {
    const health = toServiceHealth(
      IDENTITY,
      report({ status: "empty", problems: ["No data: citizens is empty."] }),
    );
    expect(health.severity).toBe("warning");
    expect(health.commands).toEqual(["npm run db:seed -w @simdpg/identity"]);
  });

  it("reports a service that never answered as an error", () => {
    const health = toServiceHealth(IDENTITY, {
      severity: "error",
      problem: "The Identity service didn't answer.",
      hint: "Check the service is deployed.",
    });
    expect(health.status).toBe("unreachable");
    expect(health.severity).toBe("error");
    expect(health.commands).toEqual([]);
  });
});

describe("summarize", () => {
  it("is ok when everything is healthy", () => {
    expect(summarize([service({ key: "portal" }), service()])).toBe("ok");
  });

  it("is an error when any database is broken", () => {
    expect(
      summarize([service(), service({ key: "health", status: "error", severity: "error" })]),
    ).toBe("error");
  });

  it("stays quiet when one system is empty and the rest hold data", () => {
    // Staff delete a population on purpose; that is not a fault.
    expect(
      summarize([
        service({ key: "portal" }),
        service(),
        service({ key: "health", status: "empty", severity: "warning" }),
      ]),
    ).toBe("ok");
  });

  it("warns when every system is empty — the seed never ran", () => {
    expect(
      summarize([
        service({ key: "portal" }),
        service({ status: "empty", severity: "warning" }),
        service({ key: "health", status: "empty", severity: "warning" }),
      ]),
    ).toBe("warning");
  });

  it("warns about a system whose database can't be verified", () => {
    expect(
      summarize([
        service({ key: "portal" }),
        service(),
        service({ key: "health", status: "unreachable", severity: "warning" }),
      ]),
    ).toBe("warning");
  });
});
