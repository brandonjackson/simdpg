import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Citizen } from "@simdpg/api-clients";
import { generateEvents } from "./generate-events";
import { randomNationalIdReg } from "./generators/random-national-id-reg";
import { eventsFilePath } from "./paths";
import type { SimulationEvent } from "./events";
import type { SimulationParameters } from "./store";
import { GENERATOR_CONFIG } from "./generators/config";
import { readGenerationSummary } from "./generation";
import { BEHAVIOR_OFF } from "@simdpg/system-kit/behavior";

function citizen(over: Partial<Citizen> = {}): Citizen {
  return {
    id: "c1",
    national_id: "NID-1",
    given_name: "Ada",
    family_name: "Lovelace",
    date_of_birth: "1990-01-01",
    sex: "female",
    email: "ada@example.test",
    phone_number: "+100",
    date_of_death: null,
    status: "alive",
    created_at: "2020-01-01",
    updated_at: "2020-01-01",
    addresses: [],
    ...over,
  };
}

const params: SimulationParameters = {
  clockSpeed: 3600,
  durationSeconds: 10 * 86_400,
  usesExistingPopulation: true,
  generatorConfig: GENERATOR_CONFIG,
  behavior: BEHAVIOR_OFF,
  projectId: "proj-1",
  projectName: "Project one",
};

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "sim-gen-"));
  process.env.SIM_DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.SIM_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("generateEvents", () => {
  it("converts sim-time to scheduledMicros, resolves URL, assigns id, persists", async () => {
    const events = await generateEvents("s1", params, {
      listCitizens: async () => [citizen()],
      resolveTarget: async (key) =>
        key === "national-id" ? { url: "http://hook/national-id" } : null,
      random: () => 0, // day 0 hit, offset 0 -> simSeconds 0
      generators: [randomNationalIdReg],
      listPrograms: async () => [],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      targetKey: "national-id",
      targetUrl: "http://hook/national-id",
      scheduledMicros: 0,
    });
    expect(typeof events[0].id).toBe("string");

    const onDisk = JSON.parse(
      await fs.readFile(eventsFilePath("s1"), "utf8"),
    ) as SimulationEvent[];
    expect(onDisk).toEqual(events);
  });

  it("computes scheduledMicros = simSeconds / clockSpeed * 1e6", async () => {
    // random: hit on day 1, offset 0 -> simSeconds = 86_400.
    const rolls = [1, 0, 0]; // day0 miss, day1 hit, offset draw = 0
    let i = 0;
    const events = await generateEvents("s2", params, {
      listCitizens: async () => [citizen()],
      resolveTarget: async () => ({ url: "http://hook" }),
      random: () => (i < rolls.length ? rolls[i++] : 1),
      generators: [randomNationalIdReg],
      listPrograms: async () => [],
    });
    expect(events[0].scheduledMicros).toBe(Math.round((86_400 / 3600) * 1_000_000));
  });

  // A run must only ever reach the OpenFn project it was started against, so
  // every URL lookup has to carry the simulation's project — not the default.
  it("resolves target URLs against the simulation's project", async () => {
    const asked: { key: string; projectId?: string }[] = [];
    const events = await generateEvents(
      "s-project",
      { ...params, projectId: "proj-7", projectName: "Project seven" },
      {
        listCitizens: async () => [citizen()],
        resolveTarget: async (key, projectId) => {
          asked.push({ key, projectId });
          return { url: `http://${projectId}/${key}` };
        },
        random: () => 0,
        generators: [randomNationalIdReg],
        listPrograms: async () => [],
      },
    );

    expect(asked).toEqual([{ key: "national-id", projectId: "proj-7" }]);
    expect(events[0].targetUrl).toBe("http://proj-7/national-id");
  });

  it("stores null targetUrl when nothing is registered", async () => {
    const events = await generateEvents("s3", params, {
      listCitizens: async () => [citizen()],
      resolveTarget: async () => null,
      random: () => 0,
      generators: [randomNationalIdReg],
      listPrograms: async () => [],
    });
    expect(events[0].targetUrl).toBeNull();
  });

  it("filters out non-alive citizens", async () => {
    const events = await generateEvents("s4", params, {
      listCitizens: async () => [citizen({ status: "deceased" })],
      resolveTarget: async () => ({ url: "http://hook" }),
      random: () => 0,
      generators: [randomNationalIdReg],
      listPrograms: async () => [],
    });
    expect(events).toHaveLength(0);
  });

  it("succeeds with an empty list when there are no citizens", async () => {
    const events = await generateEvents("s5", params, {
      listCitizens: async () => [],
      resolveTarget: async () => ({ url: "http://hook" }),
      random: () => 0,
      generators: [randomNationalIdReg],
      listPrograms: async () => [],
    });
    expect(events).toEqual([]);
    const onDisk = JSON.parse(await fs.readFile(eventsFilePath("s5"), "utf8"));
    expect(onDisk).toEqual([]);
  });

  it("sorts events ascending by scheduledMicros", async () => {
    // Two citizens: first hits day 1, second hits day 0 -> must be reordered.
    const rolls = [1, 0, 0.5, /*c2*/ 0, 0.1];
    let i = 0;
    const events = await generateEvents("s6", params, {
      listCitizens: async () => [citizen({ id: "c1" }), citizen({ id: "c2" })],
      resolveTarget: async () => ({ url: "http://hook" }),
      random: () => (i < rolls.length ? rolls[i++] : 1),
      generators: [randomNationalIdReg],
      listPrograms: async () => [],
    });
    expect(events).toHaveLength(2);
    expect(events[0].scheduledMicros).toBeLessThanOrEqual(events[1].scheduledMicros);
  });

  it("passes fetched programmes into generator contexts", async () => {
    const seen: unknown[] = [];
    const spyGen = {
      key: "spy",
      generate: (ctx: { programs: unknown[] }) => {
        seen.push(ctx.programs);
        return [];
      },
    };
    await generateEvents("s3", params, {
      listCitizens: async () => [citizen()],
      listPrograms: async () => [{ id: "p1" } as any],
      resolveTarget: async () => null,
      random: () => 0,
      generators: [spyGen as any],
    });
    expect(seen[0]).toEqual([{ id: "p1" }]);
  });

  // Every rate is per simulated day, and the day loop used to floor the run's
  // duration — so anything under 24h generated an empty script with no hint why.
  it("generates events for a run shorter than one simulated day", async () => {
    const events = await generateEvents(
      "s-subday",
      { ...params, durationSeconds: 1_800 },
      {
        listCitizens: async () => [citizen()],
        resolveTarget: async () => ({ url: "http://hook" }),
        random: () => 0, // always registers, offset 0
        generators: [randomNationalIdReg],
        listPrograms: async () => [],
      },
    );

    expect(events).toHaveLength(1);
    expect(events[0].scheduledMicros).toBe(0);
  });

  it("records what generation drew on, including unroutable targets", async () => {
    await generateEvents("s-summary", { ...params, durationSeconds: 2 * 86_400 }, {
      listCitizens: async () => [citizen(), citizen({ id: "c2", status: "deceased" })],
      listPrograms: async () => [{ id: "p1" } as any],
      resolveTarget: async () => null,
      random: () => 0,
      generators: [randomNationalIdReg],
    });

    expect(await readGenerationSummary("s-summary")).toMatchObject({
      citizens: 1, // the deceased one is filtered out before generating
      programs: 1,
      days: 2,
      events: 1,
      unroutedEvents: 1,
      unroutedTargets: ["national-id"],
    });
  });

  it("records a zero-citizen, zero-event generation so the empty script is explainable", async () => {
    await generateEvents("s-empty", { ...params, durationSeconds: 3_600 }, {
      listCitizens: async () => [],
      listPrograms: async () => [],
      resolveTarget: async () => ({ url: "http://hook" }),
      random: () => 0,
      generators: [randomNationalIdReg],
    });

    expect(await readGenerationSummary("s-empty")).toMatchObject({
      citizens: 0,
      events: 0,
      days: 3_600 / 86_400,
      unroutedTargets: [],
      unroutedEvents: 0,
    });
  });

  it("has no generation summary for a simulation that was never generated", async () => {
    expect(await readGenerationSummary("never-generated")).toBeNull();
  });

  it("uses parameters.generatorConfig when running generators", async () => {
    const zeroConfig = {
      ...GENERATOR_CONFIG,
      nationalId: { dailyProbPerCitizen: 0 },
    };
    const events = await generateEvents(
      "s7",
      { ...params, generatorConfig: zeroConfig },
      {
        listCitizens: async () => [citizen()],
        resolveTarget: async () => ({ url: "http://hook" }),
        random: () => 0,
        generators: [randomNationalIdReg],
        listPrograms: async () => [],
      },
    );
    expect(events).toEqual([]);
  });
});
