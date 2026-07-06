import path from "node:path";

/** Base dir shared with the worker. Matches simulation/src/engine/paths.ts. */
export function simDataDir(): string {
  return process.env.SIM_DATA_DIR || process.cwd();
}

/**
 * SQLite file holding the portal's simulation records, run-state, and
 * form-webhook registry. The portal and the (separately spawned) worker both
 * resolve the same path so they read/write one database. Defaults to
 * `<SIM_DATA_DIR>/data/simulations.sqlite`; override with `PORTAL_DB_FILE` to
 * point at a persistent, writable volume in ephemeral-host deployments.
 * Must stay in step with simulation/src/engine/paths.ts.
 */
export function simDbPath(): string {
  return (
    process.env.PORTAL_DB_FILE ||
    path.join(simDataDir(), "data", "simulations.sqlite")
  );
}

export function eventsFilePath(id: string): string {
  return path.join(simDataDir(), ".simulations", `${id}.events.json`);
}
