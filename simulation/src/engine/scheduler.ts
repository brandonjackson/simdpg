import type { SimulationEvent } from "./events.js";
import { deliver, type DeliveryDeps, type EventOutcome } from "./delivery.js";

/** Default POSTs allowed in flight at once. See #59: serial delivery to slow
 * remote webhooks made runs take ~Σ(latency) instead of the scheduled span. */
export const DEFAULT_MAX_CONCURRENCY = 20;

export interface RunCounts {
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
}

/** Live view of a run, emitted whenever a delivery starts or finishes. */
export interface ProgressSnapshot extends RunCounts {
  /** Deliveries currently in flight. */
  inFlight: number;
  /** High-water mark of in-flight deliveries so far. */
  peakConcurrency: number;
}

/** Everything the schedule loop needs, plus what each delivery needs. */
export interface RunDeps extends DeliveryDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  onOutcome?: (o: EventOutcome) => void;
  /** Called on every delivery start/finish so callers can log live progress. */
  onProgress?: (snapshot: ProgressSnapshot) => void;
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

/**
 * Run all events at their real-time offsets. Deliveries run concurrently (capped
 * at maxConcurrency) so a slow endpoint doesn't serialize the whole schedule; a
 * single failure never aborts the run.
 */
export async function runEvents(
  events: SimulationEvent[],
  startMs: number,
  deps: RunDeps,
  options: RunOptions = {},
): Promise<RunResult> {
  const ordered = [...events].sort((a, b) => a.scheduledMicros - b.scheduledMicros);
  const counts: RunCounts = { delivered: 0, skipped: 0, failed: 0, total: events.length };
  const maxConcurrency = Math.max(1, options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);

  let inFlight = 0;
  let peakConcurrency = 0;
  const pending = new Set<Promise<void>>();

  const emitProgress = (): void => {
    deps.onProgress?.({ ...counts, inFlight, peakConcurrency });
  };

  const dispatch = (event: SimulationEvent): void => {
    inFlight += 1;
    peakConcurrency = Math.max(peakConcurrency, inFlight);
    emitProgress();
    const p = deliver(event, deps)
      .then((outcome) => {
        counts[outcome] += 1;
        deps.onOutcome?.(outcome);
      })
      .finally(() => {
        inFlight -= 1;
        emitProgress();
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
