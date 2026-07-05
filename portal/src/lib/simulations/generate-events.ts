import { randomUUID } from "node:crypto";
import { IdentityClient, SYSTEM_URLS, type Citizen } from "@simdpg/api-clients";
import { resolveFormWebhook } from "@/lib/form-webhooks";
import { REGISTRY } from "./generators";
import { writeEvents, type SimulationEvent } from "./events";
import type { SimulationParameters } from "./store";

/** Time-step for generation: 1 day. Hardcoded for v1 (see #54 spec). */
export const DT_SECONDS = 86_400;

export interface GenerateEventsDeps {
  /** Defaults to the Identity system's citizen list. */
  listCitizens?: () => Promise<Citizen[]>;
  /** Defaults to the form-webhook registry. Returns `{ url }` or null. */
  resolveTarget?: (key: string) => Promise<{ url: string } | null>;
  /** Randomness source; defaults to Math.random. */
  random?: () => number;
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

  const citizens = (await listCitizens()).filter((c) => c.status === "alive");

  const generated = REGISTRY.flatMap((gen) =>
    gen.generate({
      citizens,
      dtSeconds: DT_SECONDS,
      durationSeconds: parameters.durationSeconds,
      random,
    }),
  );

  const urlCache = new Map<string, string | null>();
  async function urlFor(key: string): Promise<string | null> {
    if (!urlCache.has(key)) {
      const resolved = await resolveTarget(key);
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
