/**
 * Measure what the delivery pool actually sustains, end to end.
 *
 * This is the harness behind issue #93's "measure achieved throughput". It uses
 * the real scheduler publish loop and the real Redis queue, so the number it
 * prints is the whole path — timer floor, enqueue cost, pool concurrency — not a
 * microbenchmark of any one part.
 *
 *   docker compose up -d redis sim-worker
 *   docker compose --profile bench up -d sim-mock-webhook
 *   npm run sim:bench -w @simdpg/simulation
 *
 * Two rates come out, and the gap between them is the point:
 *
 *   enqueue rate    what the scheduler's setTimeout loop can publish
 *   delivery rate   what the pool drained, which is what a run experiences
 *
 * The design predicts the enqueue rate caps near 1–2k/sec on Node's ~1ms timer
 * floor no matter how many workers idle. That ceiling is what the phase 2
 * bucketing work removes.
 *
 *   BENCH_EVENTS      events to schedule (default 20000)
 *   BENCH_RATE        events/sec the schedule asks for (default 10000)
 *   BENCH_TARGET_URL  where workers POST (default http://sim-mock-webhook:3010/hook)
 *   REDIS_URL         required
 */

import { Queue } from "bullmq";
import { publishEvents } from "./engine/scheduler.js";
import type { SimulationEvent } from "./engine/events.js";
import {
  createRedis,
  queueName,
  readRunCounters,
  resetRunCounters,
  type DeliveryJob,
} from "./engine/queue.js";
import { sleep, log } from "./utils.js";

const DRAIN_TIMEOUT_MS = 120_000;

function intFromEnv(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export async function runBenchmark(): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL must be set — the benchmark measures the real queue");
  }

  const count = intFromEnv("BENCH_EVENTS", 20_000);
  const rate = intFromEnv("BENCH_RATE", 10_000);
  const targetUrl = process.env.BENCH_TARGET_URL?.trim() || "http://sim-mock-webhook:3010/hook";
  const simulationId = `bench-${process.pid}`;

  const spacingMicros = 1_000_000 / rate;
  const events: SimulationEvent[] = Array.from({ length: count }, (_, i) => ({
    id: `bench-${i}`,
    scheduledMicros: Math.round(i * spacingMicros),
    targetKey: "bench",
    targetUrl,
    payload: { i, at: new Date().toISOString() },
  }));

  const redis = createRedis();
  const queue = new Queue<DeliveryJob>(queueName(), { connection: redis });

  log(
    `bench: ${count} events at a scheduled ${rate}/sec (span ` +
      `${(count / rate).toFixed(1)}s) → ${targetUrl}`,
  );
  await resetRunCounters(redis, simulationId);

  const startMs = Date.now();
  const published = await publishEvents(events, startMs, {
    now: Date.now,
    sleep,
    shouldStop: () => false,
    publish: async (event) => {
      await queue.add("deliver", { simulationId, event }, { removeOnComplete: true });
    },
  });
  const publishMs = Date.now() - startMs;

  log(
    `bench: enqueued ${published.enqueued} in ${(publishMs / 1000).toFixed(2)}s = ` +
      `${(published.enqueued / (publishMs / 1000)).toFixed(0)} enqueues/sec ` +
      `(max schedule lag ${published.maxLagMs.toFixed(0)}ms)`,
  );

  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let counters = await readRunCounters(redis, simulationId);
  while (counters.delivered + counters.skipped + counters.failed < published.enqueued) {
    if (Date.now() >= deadline) {
      log("bench: drain timed out — is the worker pool running?");
      break;
    }
    await sleep(100);
    counters = await readRunCounters(redis, simulationId);
  }
  const totalMs = Date.now() - startMs;
  const done = counters.delivered + counters.skipped + counters.failed;

  log("");
  log(`bench: delivered ${counters.delivered}, failed ${counters.failed}, skipped ${counters.skipped}`);
  log(`bench: ${done} deliveries in ${(totalMs / 1000).toFixed(2)}s`);
  log(`bench: ACHIEVED ${(done / (totalMs / 1000)).toFixed(0)} deliveries/sec`);

  await queue.close();
  redis.disconnect();
}
