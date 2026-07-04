import path from "node:path";

/** Base directory both the portal and worker resolve simulation data from. */
export function simDataDir(): string {
  return process.env.SIM_DATA_DIR || process.cwd();
}

export function eventsFilePath(id: string): string {
  return path.join(simDataDir(), ".simulations", `${id}.events.json`);
}

export function runStateFilePath(id: string): string {
  return path.join(simDataDir(), ".simulations", `${id}.run.json`);
}
