import { readEvents, type SimulationEvent } from "./events.js";
import { writeRunState, type SimulationRunState } from "./run-state.js";
import { runEvents, type RunCounts, type ProgressSnapshot } from "./scheduler.js";
import {
  createDeliveryQueue,
  readCounters,
  resetCounters,
  DELIVERY_JOB,
  type OutcomeCounts,
} from "./queue.js";
import { createRedis, redisUrl, redactRedisUrl } from "./redis.js";
import { sleep, log, logError } from "../utils.js";

/** Min ms between live progress log lines, so a big run isn't per-event noise. */
const PROGRESS_LOG_INTERVAL_MS = 1000;

/** Run-scoped queue depth past which the pool is visibly losing the race with
 * the clock, and deliveries are going out late. */
const QUEUE_DEPTH_WARN = 500;

/**
 * The run-scoped side of the delivery pool the scheduler talks to: clear the
 * run's counters, publish jobs, read the tally back, and tear down. Injected so
 * runWorker's orchestration (the DB writes) unit-tests without a real Redis or a
 * consuming worker pool — the real one is `createRedisTransport`.
 */
export interface DeliveryTransport {
  reset: () => Promise<void>;
  enqueue: (event: SimulationEvent) => Promise<void>;
  readCounts: () => Promise<OutcomeCounts>;
  close: () => Promise<void>;
}

export type CreateTransport = (simulationId: string) => DeliveryTransport;

/**
 * The real transport: a BullMQ queue to publish on plus a separate connection
 * for counter reads/resets. Both connections are this process's to close —
 * BullMQ never closes a connection it's handed, and an idle Redis socket keeps
 * the process alive.
 */
function createRedisTransport(simulationId: string): DeliveryTransport {
  const queueConn = createRedis();
  const counters = createRedis();
  const queue = createDeliveryQueue(queueConn);
  return {
    reset: () => resetCounters(counters, simulationId),
    enqueue: async (event) => { await queue.add(DELIVERY_JOB, { simulationId, event }); },
    readCounts: () => readCounters(counters, simulationId),
    close: async () => {
      await queue.close();
      await queueConn.quit();
      await counters.quit();
    },
  };
}

/**
 * Execute a generated simulation: publish every event's delivery to the shared
 * queue by real time, wait for the worker pool to settle them, then record the
 * terminal run-state to the shared database. writeRunState also stamps the
 * authoritative `simulations` record, so the portal reads a consistent status
 * with no reconciliation. Never throws — failures are written as run-state.
 *
 * `createTransport` defaults to the real Redis-backed pool; tests inject a fake.
 */
export async function runWorker(
  id: string,
  createTransport: CreateTransport = createRedisTransport,
): Promise<void> {
  // The portal tees our stdio to its terminal; if it restarts mid-run the pipe
  // breaks. Swallow EPIPE so a hot-reload can't kill an in-flight simulation
  // (its log file, opened by the portal, keeps recording regardless).
  process.stdout.on("error", () => {});
  process.stderr.on("error", () => {});

  const startedAt = new Date().toISOString();
  let events: SimulationEvent[];
  try {
    events = await readEvents(id);
  } catch (err) {
    // Fails before any Redis connection is opened, so a missing events file
    // never depends on the pool being reachable.
    await writeRunState(id, {
      pid: process.pid, status: "failed", startedAt, completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      delivered: 0, skipped: 0, failed: 0, total: 0,
    });
    logError(`Simulation ${id} failed to start`, err);
    return;
  }

  let stopped = false;
  process.on("SIGTERM", () => { stopped = true; });

  const transport = createTransport(id);

  const finalize = async (status: SimulationRunState["status"], counts: RunCounts) => {
    await writeRunState(id, {
      pid: process.pid, status, startedAt, completedAt: new Date().toISOString(),
      delivered: counts.delivered, skipped: counts.skipped, failed: counts.failed, total: counts.total,
    });
  };

  try {
    await writeRunState(id, {
      pid: process.pid, status: "running", startedAt,
      delivered: 0, skipped: 0, failed: 0, total: events.length,
    });
    // Clear any stale tallies so a re-run of this id doesn't look already-drained.
    await transport.reset();
    log(`Simulation ${id}: enqueuing ${events.length} events to ${redactRedisUrl(redisUrl())}`);

    const runStart = Date.now();
    let lastProgressLog = 0;
    let lastDepthWarn = 0;

    // The scheduler must never pause to let the pool catch up — that would
    // corrupt the schedule — so a pool losing the race can only be made visible.
    const warnIfBehind = (s: ProgressSnapshot, now: number): void => {
      if (s.depth < QUEUE_DEPTH_WARN || now - lastDepthWarn < PROGRESS_LOG_INTERVAL_MS) return;
      lastDepthWarn = now;
      log(
        `Simulation ${id}: queue depth ${s.depth} (publish lag ${Math.round(s.lagMs)}ms) — ` +
          `the pool is falling behind the schedule`,
      );
    };

    const onProgress = (s: ProgressSnapshot): void => {
      const now = Date.now();
      const done = s.delivered + s.skipped + s.failed;
      warnIfBehind(s, now);
      // Log at most once per interval, but always log the final drain.
      if (now - lastProgressLog < PROGRESS_LOG_INTERVAL_MS && done < s.enqueued) return;
      lastProgressLog = now;
      const secs = ((now - runStart) / 1000).toFixed(1);
      log(
        `Simulation ${id} [+${secs}s]: enqueued ${s.enqueued}/${s.total} ` +
          `(depth ${s.depth}, lag ${Math.round(s.lagMs)}ms) — delivered ${s.delivered}, ` +
          `skipped ${s.skipped}, failed ${s.failed} (${done}/${s.enqueued} settled)`,
      );
    };

    const { counts, stopped: wasStopped, enqueued, failedToEnqueue, maxLagMs, drainStalled } =
      await runEvents(
        events,
        runStart,
        {
          now: Date.now,
          sleep,
          shouldStop: () => stopped,
          enqueue: transport.enqueue,
          readCounts: transport.readCounts,
          onProgress,
        },
      );
    // A stalled drain still finalizes: the counters are the best total available,
    // and leaving the row `running` forever is strictly worse than a short count.
    // runEvents has already logged which jobs never settled.
    await finalize(wasStopped ? "stopped" : "completed", counts);
    log(
      `Simulation ${id}: ${wasStopped ? "stopped" : "completed"} — enqueued ${enqueued}/${events.length}` +
        (failedToEnqueue > 0 ? `, ${failedToEnqueue} failed to enqueue` : "") +
        `, delivered ${counts.delivered}, skipped ${counts.skipped}, failed ${counts.failed} ` +
        `(max publish lag ${Math.round(maxLagMs)}ms` +
        (drainStalled ? ", drain stalled — counts are a floor" : "") +
        `)`,
    );
  } catch (err) {
    await writeRunState(id, {
      pid: process.pid, status: "failed", startedAt, completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      delivered: 0, skipped: 0, failed: 0, total: events.length,
    });
    logError(`Simulation ${id} crashed`, err);
  } finally {
    await transport.close();
  }
}
