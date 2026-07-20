import { createClient, type RedisClientType } from "redis";

/**
 * Shared Redis handle for the (upcoming) queue-based event delivery. This is
 * foundation only — nothing consumes it yet; it exists so the connection
 * plumbing can land and be verified independently of the queue work.
 *
 * Mirrors how `engine/db.ts` caches its SQLite handle: a single connection,
 * opened lazily and reused. Because connecting is async, we cache the
 * *promise* (not the resolved client) so concurrent callers share one connect
 * instead of racing to open several sockets.
 */

/** Connection string, overridable via env; defaults to a local Redis. */
export function redisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

let clientPromise: Promise<RedisClientType> | null = null;

/**
 * Open (once) the shared Redis connection and return the connected client.
 * Lazy so that importing this module — or running a worker command that never
 * touches Redis — doesn't force a connection.
 */
export function getRedis(): Promise<RedisClientType> {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const client: RedisClientType = createClient({ url: redisUrl() });
    // node-redis emits 'error' for connection drops as well as command errors;
    // an unhandled listener would crash the process, so log and let the
    // client's own reconnection handle recovery.
    client.on("error", (err) => {
      console.error("[redis] client error:", err);
    });
    await client.connect();
    return client;
  })().catch((err) => {
    // Don't cache a failed connect — allow the next caller to retry.
    clientPromise = null;
    throw err;
  });

  return clientPromise;
}

/** Close the shared connection (if open). Safe to call when never opened. */
export async function closeRedis(): Promise<void> {
  if (!clientPromise) return;
  const pending = clientPromise;
  clientPromise = null;
  try {
    const client = await pending;
    await client.quit();
  } catch {
    // Already failed to connect / closing a broken client — nothing to do.
  }
}
