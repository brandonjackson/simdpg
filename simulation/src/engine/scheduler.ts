import type { SimulationEvent } from "./events.js";
import { log } from "../utils.js";

export type EventOutcome = "delivered" | "skipped" | "failed";

export interface RunCounts {
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
}

export interface DeliveryDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  fetch: typeof fetch;
  shouldStop: () => boolean;
  onOutcome?: (o: EventOutcome) => void;
}

/** Deliver one event: skip when unregistered, POST otherwise. Never throws. */
export async function deliver(event: SimulationEvent, deps: DeliveryDeps): Promise<EventOutcome> {
  if (event.targetUrl === null) {
    log(`skip ${event.id} (${event.targetKey}): no webhook registered`);
    return "skipped";
  }
  try {
    const res = await deps.fetch(event.targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.payload),
    });
    if (res.ok) return "delivered";
    log(`fail ${event.id} (${event.targetKey}): HTTP ${res.status}`);
    return "failed";
  } catch (err) {
    log(`fail ${event.id} (${event.targetKey}): ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }
}

/** Run all events at their real-time offsets. A single failure never aborts the run. */
export async function runEvents(
  events: SimulationEvent[],
  startMs: number,
  deps: DeliveryDeps,
): Promise<{ counts: RunCounts; stopped: boolean }> {
  const ordered = [...events].sort((a, b) => a.scheduledMicros - b.scheduledMicros);
  const counts: RunCounts = { delivered: 0, skipped: 0, failed: 0, total: events.length };

  for (const event of ordered) {
    if (deps.shouldStop()) return { counts, stopped: true };
    const targetMs = startMs + event.scheduledMicros / 1000;
    const waitMs = targetMs - deps.now();
    if (waitMs > 0) await deps.sleep(waitMs);
    if (deps.shouldStop()) return { counts, stopped: true };

    const outcome = await deliver(event, deps);
    counts[outcome] += 1;
    deps.onOutcome?.(outcome);
  }

  return { counts, stopped: false };
}
