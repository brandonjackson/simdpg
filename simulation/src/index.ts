/**
 * SimDPG Population Simulator
 *
 * Commands:
 *   generate  - Generate an initial population
 *   year      - Simulate one year of life events
 *   scale     - Run at scale with configurable parameters
 *   apply     - Submit national ID applications through the OpenFn workflow
 *   redis-ping - Check the Redis connection (see engine/redis.ts)
 *
 * Environment variables:
 *   POPULATION_SIZE    - Target population size (default: 100)
 *   CONCURRENCY        - Max concurrent requests for scale mode (default: 5)
 *   YEARS              - Number of years to simulate in scale mode (default: 1)
 *   APPLICATIONS       - National ID applications to submit in apply mode (default: 10)
 *   IDENTITY_URL       - Identity system URL (default: http://localhost:3001)
 *   CIVIL_REGISTRY_URL - Civil registry system URL (default: http://localhost:3002)
 *   HEALTH_URL         - Health system URL (default: http://localhost:3003)
 *   BENEFITS_URL       - Benefits system URL (default: http://localhost:3004)
 *   OPENFN_NATIONAL_ID_WEBHOOK_URL - OpenFn webhook for apply mode (else uses PORTAL_URL)
 *   PORTAL_URL         - Portal base URL for apply mode (default: http://localhost:3000)
 */

import { generate, configFromEnv } from "./generate.js";
import { runYear, runScale, yearConfigFromEnv, scaleConfigFromEnv } from "./run.js";
import { runApplications, applyConfigFromEnv } from "./events/application.js";
import { runWorker } from "./engine/worker.js";
import { createRedis, redisUrl, redactRedisUrl } from "./engine/redis.js";
import { log, logError } from "./utils.js";

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case "generate": {
      log("Generating initial population...");
      const config = configFromEnv();
      const report = await generate(config);
      report.print();
      break;
    }
    case "year": {
      log("Simulating one year of events...");
      const config = yearConfigFromEnv();
      await runYear(config);
      break;
    }
    case "scale": {
      log("Running scale simulation...");
      const config = scaleConfigFromEnv();
      await runScale(config);
      break;
    }
    case "apply": {
      log("Submitting national ID applications...");
      const config = applyConfigFromEnv();
      const report = await runApplications(config);
      report.print();
      break;
    }
    case "run": {
      const id = process.argv[3];
      if (!id) {
        logError("Usage: tsx src/index.ts run <simulationId>", new Error("missing id"));
        process.exit(1);
      }
      await runWorker(id);
      break;
    }
    case "redis-ping": {
      // Nothing consumes Redis yet; this is how the connection module is
      // verified against a live server (`docker compose up redis`).
      const url = redisUrl();
      log(`Pinging Redis at ${redactRedisUrl(url)}...`);
      // Bounded retries, unlike the worker defaults: a one-shot check must fail
      // loudly on a bad URL rather than retry forever with the PING queued.
      const client = createRedis(url, {
        connectTimeout: 5_000,
        retryStrategy: () => null,
        maxRetriesPerRequest: 1,
      });
      // Capture the underlying socket error; without a listener ioredis logs
      // "Unhandled error event", and connect() then rejects with a generic
      // "Connection is closed" that hides the real cause (e.g. ECONNREFUSED).
      let socketError: Error | null = null;
      client.on("error", (err: Error) => {
        socketError ??= err;
      });
      try {
        await client.connect();
        const reply = await client.ping();
        log(`Redis replied: ${reply}`);
        await client.quit();
      } catch (err) {
        client.disconnect();
        logError(`Could not reach Redis at ${redactRedisUrl(url)}`, socketError ?? err);
        process.exit(1);
      }
      break;
    }
    default:
      log("Usage: tsx src/index.ts <command>");
      log("");
      log("Commands:");
      log("  generate  - Generate an initial population");
      log("  year      - Simulate one year of life events");
      log("  scale     - Run at scale with configurable parameters");
      log("  apply     - Submit national ID applications through the OpenFn workflow");
      log("  redis-ping - Check the Redis connection");
      log("");
      log("Environment variables:");
      log("  POPULATION_SIZE    - Target population size (default: 100)");
      log("  CONCURRENCY        - Max concurrent requests (default: 5)");
      log("  YEARS              - Years to simulate (default: 1)");
      log("  IDENTITY_URL       - Identity system (default: http://localhost:3001)");
      log("  CIVIL_REGISTRY_URL - Civil registry (default: http://localhost:3002)");
      log("  HEALTH_URL         - Health system (default: http://localhost:3003)");
      log("  BENEFITS_URL       - Benefits system (default: http://localhost:3004)");
      log("  REDIS_URL          - Redis connection (default: redis://localhost:6379)");
      process.exit(1);
  }
}

main().catch((err) => {
  logError("Fatal error", err);
  process.exit(1);
});
