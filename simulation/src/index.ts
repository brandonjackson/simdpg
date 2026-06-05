/**
 * SimDPG Population Simulator
 *
 * Commands:
 *   generate  - Generate an initial population
 *   year      - Simulate one year of life events
 *   scale     - Run at scale with configurable parameters
 */

const command = process.argv[2];

switch (command) {
  case "generate":
    console.log("Generating initial population...");
    break;
  case "year":
    console.log("Simulating one year of events...");
    break;
  case "scale":
    console.log("Running scale simulation...");
    break;
  default:
    console.log("Usage: sim:generate | sim:year | sim:scale");
    process.exit(1);
}
