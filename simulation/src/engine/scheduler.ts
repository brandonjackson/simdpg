import type { SimulationEvent } from "./events.js";
import { log } from "../utils.js";

export type EventOutcome = "delivered" | "skipped" | "failed";

/** Default per-POST timeout; a hung endpoint must not stall the whole run. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface RunCounts {
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
}

export interface DeliveryDeps {
  fetch: typeof fetch;
  /** Per-POST abort timeout in ms. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** One unit of work for the delivery pool: everything needed to POST an event. */
export interface DeliveryJob {
  /** Stamped so a consumer can attribute the outcome to its run. */
  simulationId: string;
  event: SimulationEvent;
}

/**
 * What the publish loop needs from the delivery queue.
 *
 * Deliberately two methods wide, so the Redis-backed queue, the in-process
 * stand-in, and test fakes are interchangeable without the scheduler knowing
 * which one it holds.
 */
export interface DeliveryQueue {
  /** Publish one job. Resolves once queued — NOT once delivered. */
  enqueue(job: DeliveryJob): Promise<void>;
  /** Resolves once every published job has been consumed. */
  waitForDrain?(): Promise<void>;
}

/** Live view of the publish loop, emitted as jobs are queued and acknowledged. */
export interface PublishSnapshot {
  /** Jobs the queue has accepted so far. */
  enqueued: number;
  /** Events in the run. */
  total: number;
  /** `enqueue()` calls still awaiting acknowledgement. */
  pending: number;
  /** High-water mark of `pending`. */
  peakPending: number;
  /** How late the most recent publish was against its scheduled moment, in ms. */
  lagMs: number;
}

export interface PublishDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  simulationId: string;
  queue: DeliveryQueue;
  /** Called on every publish and acknowledgement so callers can log progress. */
  onProgress?: (snapshot: PublishSnapshot) => void;
}

export interface PublishResult {
  /** Jobs the queue accepted. */
  enqueued: number;
  /** Jobs the queue rejected. Publishing continues; those events are lost. */
  failedToEnqueue: number;
  total: number;
  stopped: boolean;
  peakPending: number;
  /** Worst gap between an event's scheduled moment and its publish, in ms. */
  maxLagMs: number;
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
 * Publish every event to the delivery queue at its scheduled wall-clock moment.
 *
 * The scheduler owns the clock and nothing else: it walks the sorted events,
 * sleeps to each one's moment, and hands it over. Delivery — and the
 * concurrency cap that used to live here — belongs to the consumer side now,
 * where the real limit is pool size (replicas × per-worker concurrency).
 *
 * The loop never pauses to let consumers catch up, because pausing would
 * corrupt the schedule. Lag is surfaced through `lagMs`/`maxLagMs` instead, so
 * a pool that cannot keep up is visible rather than silent.
 */
export async function runEvents(
  events: SimulationEvent[],
  startMs: number,
  deps: PublishDeps,
): Promise<PublishResult> {
  const ordered = [...events].sort((a, b) => a.scheduledMicros - b.scheduledMicros);
  const total = events.length;

  let enqueued = 0;
  let failedToEnqueue = 0;
  let pending = 0;
  let peakPending = 0;
  let lagMs = 0;
  let maxLagMs = 0;
  const publishes = new Set<Promise<void>>();

  const emitProgress = (): void => {
    deps.onProgress?.({ enqueued, total, pending, peakPending, lagMs });
  };

  const dispatch = (event: SimulationEvent): void => {
    pending += 1;
    peakPending = Math.max(peakPending, pending);
    const p = deps.queue
      .enqueue({ simulationId: deps.simulationId, event })
      .then(() => {
        enqueued += 1;
      })
      .catch((err: unknown) => {
        // A rejected publish loses one event; it must not abort the run.
        failedToEnqueue += 1;
        log(`enqueue failed ${event.id} (${event.targetKey}): ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        pending -= 1;
        publishes.delete(p);
        emitProgress();
      });
    publishes.add(p);
    emitProgress();
  };

  let stopped = false;
  for (const event of ordered) {
    if (deps.shouldStop()) { stopped = true; break; }
    const targetMs = startMs + event.scheduledMicros / 1000;
    const waitMs = targetMs - deps.now();
    if (waitMs > 0) await deps.sleep(waitMs);
    if (deps.shouldStop()) { stopped = true; break; }

    lagMs = Math.max(0, deps.now() - targetMs);
    maxLagMs = Math.max(maxLagMs, lagMs);
    dispatch(event);
  }

  // Every publish must be acknowledged, and the queue emptied, before the run
  // can call itself finished — a stopped run drains what it already published.
  await Promise.all(publishes);
  await deps.queue.waitForDrain?.();

  return { enqueued, failedToEnqueue, total, stopped, peakPending, maxLagMs };
}
