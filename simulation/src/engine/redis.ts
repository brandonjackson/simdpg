import Redis from "ioredis";
import { log } from "../utils.js";

/**
 * Shared Redis connection for a simulation process.
 *
 * Redis is optional. Without `REDIS_URL` — the default for a local
 * `npm run dev` — every caller gets `null` and falls back to process-local
 * behaviour, so a single-process run needs no broker to work.
 *
 * The connection is lazy: importing this module never opens a socket, so a
 * process that only ever touches SQLite pays nothing for Redis being
 * configured.
 */

let client: Redis | null = null;
let resolved = false;

/** Configured broker URL, or undefined when this process runs Redis-free. */
export function redisUrl(): string | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url ? url : undefined;
}

/**
 * The process-wide Redis client, or null when `REDIS_URL` is unset.
 *
 * `lazyConnect` defers the socket to the first command, and
 * `maxRetriesPerRequest: null` matches what BullMQ requires of a connection it
 * shares — a command issued while Redis is down waits for reconnect rather than
 * rejecting. Callers that must not block (the per-job stop check) impose their
 * own deadline; see `withDeadline` in run-control.ts.
 */
export function getRedis(): Redis | null {
  if (resolved) return client;
  resolved = true;

  const url = redisUrl();
  if (!url) return null;

  client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
  // Without a listener an emitted 'error' is an unhandled exception that kills
  // the run. A broker blip must never take a simulation down with it.
  client.on("error", (err: Error) => log(`redis: ${err.message}`));
  return client;
}

/** Close the shared connection so a finished process can exit. Safe to repeat. */
export async function closeRedis(): Promise<void> {
  const existing = client;
  client = null;
  resolved = false;
  if (!existing) return;
  try {
    await existing.quit();
  } catch {
    // Already disconnected, or the broker went away — either way we're done
    // with it. Force the socket shut so the event loop can drain.
    existing.disconnect();
  }
}

/** Test seam: install a client (or null) without reading the environment. */
export function setRedisForTesting(next: Redis | null): void {
  client = next;
  resolved = true;
}
