import path from "node:path";

/** Base directory both the portal and worker resolve simulation data from. */
export function simDataDir(): string {
  return process.env.SIM_DATA_DIR || process.cwd();
}

/**
 * SQLite file shared with the portal (records, event scripts, run-state, form
 * webhooks). Must resolve to the same path the portal uses — see
 * portal/src/lib/simulations/paths.ts.
 */
export function simDbPath(): string {
  return (
    process.env.PORTAL_DB_FILE ||
    path.join(simDataDir(), "data", "simulations.sqlite")
  );
}

/**
 * Where event scripts were written before they moved into the database (see
 * portal/src/lib/db/schema.ts). Read only — nothing writes here any more.
 */
export function eventsFilePath(id: string): string {
  return path.join(simDataDir(), ".simulations", `${id}.events.json`);
}
