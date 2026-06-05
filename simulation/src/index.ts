/**
 * SimDPG Population Simulator
 *
 * Commands:
 *   generate  - Generate an initial population
 *   year      - Simulate one year of life events
 *   scale     - Run at scale with configurable parameters
 *
 * Environment variables:
 *   POPULATION_SIZE    - Target population size (default: 100)
 *   CONCURRENCY        - Max concurrent requests for scale mode (default: 5)
 *   YEARS              - Number of years to simulate in scale mode (default: 1)
 *   IDENTITY_URL       - Identity service URL (default: http://localhost:3001)
 *   CIVIL_REGISTRY_URL - Civil registry service URL (default: http://localhost:3002)
 *   HEALTH_URL         - Health service URL (default: http://localhost:3003)
 *   BENEFITS_URL       - Benefits service URL (default: http://localhost:3004)
 */

import { generate, configFromEnv } from "./generate.js";
import { runYear, runScale, yearConfigFromEnv, scaleConfigFromEnv } from "./run.js";
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
    default:
      log("Usage: tsx src/index.ts <command>");
      log("");
      log("Commands:");
      log("  generate  - Generate an initial population");
      log("  year      - Simulate one year of life events");
      log("  scale     - Run at scale with configurable parameters");
      log("");
      log("Environment variables:");
      log("  POPULATION_SIZE    - Target population size (default: 100)");
      log("  CONCURRENCY        - Max concurrent requests (default: 5)");
      log("  YEARS              - Years to simulate (default: 1)");
      log("  IDENTITY_URL       - Identity service (default: http://localhost:3001)");
      log("  CIVIL_REGISTRY_URL - Civil registry (default: http://localhost:3002)");
      log("  HEALTH_URL         - Health service (default: http://localhost:3003)");
      log("  BENEFITS_URL       - Benefits service (default: http://localhost:3004)");
      process.exit(1);
  }
}

main().catch((err) => {
  logError("Fatal error", err);
  process.exit(1);
});
