import type { SimulationEvent } from "./events.js";
import { log } from "../utils.js";

export type EventOutcome = "delivered" | "skipped" | "failed";

/** Default POSTs allowed in flight at once. See #59: serial delivery to slow
 * remote webhooks made runs take ~Σ(latency) instead of the scheduled span. */
export const DEFAULT_MAX_CONCURRENCY = 20;
/** Default per-POST timeout; a hung endpoint must not stall the whole run. */
export const DEFAULT_TIMEOUT_MS = 15_000;

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
  /** Per-POST abort timeout in ms. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface RunOptions {
  /** Max concurrent deliveries. Defaults to DEFAULT_MAX_CONCURRENCY. */
  maxConcurrency?: number;
}

export interface RunResult {
  counts: RunCounts;
  stopped: boolean;
  /** High-water mark of concurrent deliveries — how much of the cap was used. */
  peakConcurrency: number;
}

/** Deliver one event: skip when unregistered, POST otherwise. Never throws. */
export async function deliver(event: SimulationEvent, deps: DeliveryDeps): Promise<EventOutcome> {
  if (event.targetUrl === null) {
    log(`skip ${event.id} (${event.targetKey}): no webhook registered`);
    return "skipped";
  }
  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await deps.fetch(event.targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.payload),
      signal: controller.signal,
    });
    if (res.ok) return "delivered";
    log(`fail ${event.id} (${event.targetKey}): HTTP ${res.status}`);
    return "failed";
  } catch (err) {
    log(`fail ${event.id} (${event.targetKey}): ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run all events at their real-time offsets. Deliveries run concurrently (capped
 * at maxConcurrency) so a slow endpoint doesn't serialize the whole schedule; a
 * single failure never aborts the run.
 */
export async function runEvents(
  events: SimulationEvent[],
  startMs: number,
  deps: DeliveryDeps,
  options: RunOptions = {},
): Promise<RunResult> {
  const ordered = [...events].sort((a, b) => a.scheduledMicros - b.scheduledMicros);
  const counts: RunCounts = { delivered: 0, skipped: 0, failed: 0, total: events.length };
  const maxConcurrency = Math.max(1, options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);

  let inFlight = 0;
  let peakConcurrency = 0;
  const pending = new Set<Promise<void>>();

  const dispatch = (event: SimulationEvent): void => {
    inFlight += 1;
    peakConcurrency = Math.max(peakConcurrency, inFlight);
    const p = deliver(event, deps)
      .then((outcome) => {
        counts[outcome] += 1;
        deps.onOutcome?.(outcome);
      })
      .finally(() => {
        inFlight -= 1;
        pending.delete(p);
      });
    pending.add(p);
  };

  let stopped = false;
  for (const event of ordered) {
    if (deps.shouldStop()) { stopped = true; break; }
    const targetMs = startMs + event.scheduledMicros / 1000;
    const waitMs = targetMs - deps.now();
    if (waitMs > 0) await deps.sleep(waitMs);
    if (deps.shouldStop()) { stopped = true; break; }

    // Wait for a free slot before dispatching so no more than maxConcurrency
    // POSTs are ever in flight.
    while (inFlight >= maxConcurrency) await Promise.race(pending);
    dispatch(event);
  }

  await Promise.all(pending);
  return { counts, stopped, peakConcurrency };
}
