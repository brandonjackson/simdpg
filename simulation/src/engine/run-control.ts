import { getRedis } from "./redis.js";
import { log } from "../utils.js";

/**
 * Cross-process stop signal for a run.
 *
 * Stopping used to be one SIGTERM to one pid, because one process did every
 * delivery. With a pool, the pid the portal signals — the scheduler — is not
 * the process holding the in-flight work, and jobs already handed to Redis
 * outlive it. So the scheduler raises a flag every worker can see, and workers
 * check it per job: the scheduler quits publishing, and anything already queued
 * for that run is dropped instead of delivered.
 *
 * The portal's SIGTERM-to-scheduler-pid path is untouched. This is what the
 * scheduler does *in response* to that signal.
 */

/** Redis key holding the stop flag for one run. */
export function stopKey(id: string): string {
  return `sim:run:${id}:stopped`;
}

/**
 * How long a raised flag lives.
 *
 * The flag has to outlive the scheduler: jobs queued before the stop can be
 * popped after it exits, and they must still see the flag or they'd deliver
 * events for a run the user already stopped. It is cleared when the same
 * simulation is started again, so the TTL is only a backstop against keys
 * accumulating for runs that are never re-run.
 */
export const STOP_FLAG_TTL_SECONDS = 24 * 60 * 60;

/** Per-job stop lookups are served from cache for this long. */
export const DEFAULT_STOP_CACHE_MS = 250;

/** Longest a stop lookup may block a job handler before it gives up. */
export const STOP_LOOKUP_TIMEOUT_MS = 1_000;

export interface RunControl {
  /** Raise the stop flag for a run. Best-effort: never throws. */
  markStopped(id: string): Promise<void>;
  /** Whether a run has been stopped. Fails open (false) if unreachable. */
  isStopped(id: string): Promise<boolean>;
  /** Drop the flag so the same simulation can be run again. Never throws. */
  clearStopped(id: string): Promise<void>;
}

/** Reject rather than hang: a broker stall must not wedge a job handler. */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Redis-backed control — the real thing, shared by the scheduler and the pool.
 *
 * Every method swallows broker failures. A stop that cannot be published is
 * logged and the scheduler still stops locally and still writes `stopped`; a
 * check that cannot be answered lets the job through, on the grounds that
 * delivering a few extra events beats cancelling a healthy run over a blip.
 */
function redisRunControl(client: NonNullable<ReturnType<typeof getRedis>>): RunControl {
  return {
    async markStopped(id) {
      try {
        await withDeadline(
          client.set(stopKey(id), "1", "EX", STOP_FLAG_TTL_SECONDS),
          STOP_LOOKUP_TIMEOUT_MS,
        );
      } catch (err) {
        log(`run-control: could not publish stop for ${id}: ${String(err)}`);
      }
    },
    async isStopped(id) {
      try {
        const value = await withDeadline(client.get(stopKey(id)), STOP_LOOKUP_TIMEOUT_MS);
        return value !== null;
      } catch (err) {
        log(`run-control: stop check failed for ${id}, continuing: ${String(err)}`);
        return false;
      }
    },
    async clearStopped(id) {
      try {
        await withDeadline(client.del(stopKey(id)), STOP_LOOKUP_TIMEOUT_MS);
      } catch (err) {
        log(`run-control: could not clear stop for ${id}: ${String(err)}`);
      }
    },
  };
}

/**
 * Process-local control, used when no `REDIS_URL` is configured.
 *
 * Single-process runs still have one scheduler doing its own delivery, so a
 * flag only that process can see is exactly as good as the boolean it already
 * keeps — stop behaves as it does today, with no broker required for `npm run
 * dev`.
 */
export function createMemoryRunControl(): RunControl {
  const stopped = new Set<string>();
  return {
    async markStopped(id) { stopped.add(id); },
    async isStopped(id) { return stopped.has(id); },
    async clearStopped(id) { stopped.delete(id); },
  };
}

/** Redis-backed control when a broker is configured, process-local otherwise. */
export function createRunControl(): RunControl {
  const client = getRedis();
  return client ? redisRunControl(client) : createMemoryRunControl();
}

export interface StopGate {
  /** True when this run is stopped and the job should be dropped undelivered. */
  isStopped(id: string): Promise<boolean>;
  /** Forget any cached answer for a run. */
  invalidate(id: string): void;
}

export interface StopGateOptions {
  control?: RunControl;
  /** How long a "not stopped" answer is reused. Defaults to DEFAULT_STOP_CACHE_MS. */
  cacheMs?: number;
  now?: () => number;
}

/**
 * The per-job guard for a pool worker.
 *
 * One gate serves the whole worker; it is asked per job, with that job's
 * simulation id. A round trip per job would add a Redis op to every delivery,
 * so a negative answer is cached briefly — the window bounds how long a stopped
 * run keeps delivering, and at a quarter second it is far below what anyone
 * perceives as prompt. A positive answer is cached indefinitely: stop is
 * one-way for the lifetime of a run, and the flag is cleared only when the
 * simulation is started afresh.
 *
 * Concurrent jobs for the same run share one lookup rather than each issuing
 * their own, which matters at ~200 jobs in flight per worker.
 */
export function createStopGate(options: StopGateOptions = {}): StopGate {
  const control = options.control ?? createRunControl();
  const cacheMs = options.cacheMs ?? DEFAULT_STOP_CACHE_MS;
  const now = options.now ?? Date.now;

  const stopped = new Set<string>();
  const checkedUntil = new Map<string, number>();
  const inFlight = new Map<string, Promise<boolean>>();

  return {
    async isStopped(id) {
      if (stopped.has(id)) return true;

      const fresh = checkedUntil.get(id);
      if (fresh !== undefined && fresh > now()) return false;

      const existing = inFlight.get(id);
      if (existing) return existing;

      const lookup = control
        .isStopped(id)
        .then((isStopped) => {
          if (isStopped) stopped.add(id);
          else checkedUntil.set(id, now() + cacheMs);
          return isStopped;
        })
        .finally(() => inFlight.delete(id));

      inFlight.set(id, lookup);
      return lookup;
    },
    invalidate(id) {
      stopped.delete(id);
      checkedUntil.delete(id);
    },
  };
}
