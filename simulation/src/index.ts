/**
 * SimDPG Population Simulator
 *
 * Commands:
 *   generate  - Generate an initial population
 *   year      - Simulate one year of life events
 *   scale     - Run at scale with configurable parameters
 *   apply     - Submit national ID applications through the OpenFn workflow
 *   deliver   - Run a delivery worker, consuming the sim:deliveries queue
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
 *   REDIS_URL          - Delivery queue (default: redis://127.0.0.1:6379)
 *   SIM_WORKER_CONCURRENCY - Deliveries in flight per worker (default: 200)
 */

import { generate, configFromEnv } from "./generate.js";
import { runYear, runScale, yearConfigFromEnv, scaleConfigFromEnv } from "./run.js";
import { runApplications, applyConfigFromEnv } from "./events/application.js";
import { runWorker } from "./engine/worker.js";
import { runDeliveryWorker } from "./engine/delivery-worker.js";
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
    case "deliver": {
      // Long-lived pool member; one per container, N containers per deployment.
      await runDeliveryWorker();
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
      log("  deliver   - Run a delivery worker, consuming the sim:deliveries queue");
      log("");
      log("Environment variables:");
      log("  POPULATION_SIZE    - Target population size (default: 100)");
      log("  CONCURRENCY        - Max concurrent requests (default: 5)");
      log("  YEARS              - Years to simulate (default: 1)");
      log("  IDENTITY_URL       - Identity system (default: http://localhost:3001)");
      log("  CIVIL_REGISTRY_URL - Civil registry (default: http://localhost:3002)");
      log("  HEALTH_URL         - Health system (default: http://localhost:3003)");
      log("  BENEFITS_URL       - Benefits system (default: http://localhost:3004)");
      process.exit(1);
  }
}

main().catch((err) => {
  logError("Fatal error", err);
  process.exit(1);
});
