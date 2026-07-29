import { randomUUID } from "node:crypto";
import {
  IdentityClient,
  BenefitsClient,
  SYSTEM_URLS,
  type Citizen,
  type Program,
} from "@simdpg/api-clients";
import { resolveFormWebhook } from "@/lib/form-webhooks";
import { REGISTRY } from "./generators";
import type { RandomEventGenerator } from "./generators";
import { writeEvents, type SimulationEvent } from "./events";
import type { SimulationParameters } from "./store";
import { GENERATOR_CONFIG } from "./generators/config";

/** Time-step for generation: 1 day. Hardcoded for v1 (see #54 spec). */
export const DT_SECONDS = 86_400;

export interface GenerateEventsDeps {
  /** Defaults to the Identity system's citizen list. */
  listCitizens?: () => Promise<Citizen[]>;
  /** Defaults to the Benefits system's active programmes. */
  listPrograms?: () => Promise<Program[]>;
  /**
   * Defaults to the form-webhook registry, scoped to the simulation's project.
   * Returns `{ url }` or null.
   */
  resolveTarget?: (
    key: string,
    projectId?: string,
  ) => Promise<{ url: string } | null>;
  /** Randomness source; defaults to Math.random. */
  random?: () => number;
  /** Generators to run; defaults to the full REGISTRY. Injectable for tests. */
  generators?: RandomEventGenerator[];
}

/**
 * Precompute the full SimulationEvent list for a simulation and persist it.
 * All IO lives here; the generators it runs are pure. #54.
 */
export async function generateEvents(
  id: string,
  parameters: SimulationParameters,
  deps: GenerateEventsDeps = {},
): Promise<SimulationEvent[]> {
  const listCitizens =
    deps.listCitizens ??
    (() => new IdentityClient(SYSTEM_URLS.identity).listCitizens());
  const resolveTarget = deps.resolveTarget ?? resolveFormWebhook;
  const random = deps.random ?? Math.random;
  const listPrograms =
    deps.listPrograms ??
    (() => new BenefitsClient(SYSTEM_URLS.benefits).getPrograms("active"));
  const generators = deps.generators ?? REGISTRY;
  const config = parameters.generatorConfig ?? GENERATOR_CONFIG;

  const citizens = (await listCitizens()).filter((c) => c.status === "alive");
  const programs = await listPrograms();

  const generated = generators.flatMap((gen) =>
    gen.generate({
      citizens,
      programs,
      dtSeconds: DT_SECONDS,
      durationSeconds: parameters.durationSeconds,
      random,
      config,
    }),
  );

  // Every URL is resolved from the simulation's project, so a run only ever
  // reaches the OpenFn project it was started against.
  const urlCache = new Map<string, string | null>();
  async function urlFor(key: string): Promise<string | null> {
    if (!urlCache.has(key)) {
      const resolved = await resolveTarget(key, parameters.projectId);
      urlCache.set(key, resolved?.url ?? null);
    }
    return urlCache.get(key) ?? null;
  }

  const events: SimulationEvent[] = [];
  for (const g of generated) {
    events.push({
      id: randomUUID(),
      scheduledMicros: Math.round(
        (g.scheduledSimSeconds / parameters.clockSpeed) * 1_000_000,
      ),
      targetKey: g.targetKey,
      targetUrl: await urlFor(g.targetKey),
      payload: g.payload,
    });
  }

  events.sort((a, b) => a.scheduledMicros - b.scheduledMicros);
  await writeEvents(id, events);
  return events;
}
