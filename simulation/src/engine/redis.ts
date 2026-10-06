import Redis, { type RedisOptions } from "ioredis";

/**
 * Shared Redis connection handling for the simulation package.
 *
 * `ioredis` (rather than `redis`) because BullMQ requires an ioredis connection,
 * and the queue work this is groundwork for — see
 * docs/specs/2026-07-19-queued-event-delivery-design.md — is built on BullMQ.
 *
 * Nothing consumes this yet. `npm run sim:redis-ping -w @simdpg/simulation`
 * verifies it against a live server.
 */

const DEFAULT_URL = "redis://localhost:6379";

/** Connection URL from the environment, defaulting to the local compose service. */
export function redisUrl(): string {
  return process.env.REDIS_URL || DEFAULT_URL;
}

/**
 * Strip credentials from a Redis URL so it can be logged. Railway injects a URL
 * containing a password; log lines end up in per-simulation log files.
 */
export function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "<unparseable REDIS_URL>";
  }
}

function options(): RedisOptions {
  return {
    // Don't connect on construction. The engine imports this module for
    // commands that never touch Redis (e.g. `sim:generate`), and an open
    // socket would hold the event loop open and stop the process exiting.
    lazyConnect: true,
    // Required by BullMQ workers, which fail fast on a connection that retries
    // its blocking commands. Harmless for plain command use.
    maxRetriesPerRequest: null,
    // Dual-stack DNS lookup (A *and* AAAA). ioredis defaults to IPv4-only,
    // which cannot resolve Railway's `*.railway.internal` private hostnames in
    // environments created before 2025-10-16 — those are IPv6-only, and the
    // failure surfaces as a misleading ENOTFOUND against a correct URL.
    // https://docs.railway.com/reference/errors/enotfound-redis-railway-internal
    family: 0,
  };
}

/**
 * Open a new connection. Each BullMQ `Queue` and `Worker` needs its own: a
 * Worker's blocking commands (BRPOPLPUSH et al) monopolise their connection, so
 * it cannot be shared. Callers own the returned client and must close it.
 *
 * `overrides` exists because the defaults suit a long-lived worker, which
 * should retry indefinitely and ride out a Redis restart. A short-lived caller
 * wants the opposite — see the `redis-ping` command, which bounds the retries
 * so a bad REDIS_URL fails instead of hanging.
 */
export function createRedis(url: string = redisUrl(), overrides: RedisOptions = {}): Redis {
  return new Redis(url, { ...options(), ...overrides });
}

let cached: Promise<Redis> | null = null;

/**
 * The shared connection, opened once, for incidental commands — run counters
 * and the stop flag. Do NOT hand this to a BullMQ `Worker`; use `createRedis`.
 *
 * Caches the connect *promise*, not the resolved client, so concurrent callers
 * share one connect instead of racing to open sockets. A failed connect is not
 * cached, so the next caller retries rather than reusing a dead handle.
 */
export function getRedis(): Promise<Redis> {
  if (cached) return cached;
  cached = (async () => {
    const client = createRedis();
    await client.connect();
    return client;
  })().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

/**
 * Close the shared connection, if one was opened. Connections from
 * `createRedis` are the caller's to close. Unlike the SQLite handle in `db.ts`,
 * an idle Redis socket keeps the process alive, so long-lived entry points must
 * call this to exit cleanly.
 */
export async function closeRedis(): Promise<void> {
  if (!cached) return;
  const pending = cached;
  cached = null;
  try {
    await (await pending).quit();
  } catch {
    // Connect failed or the client is already broken — nothing to close.
  }
}
