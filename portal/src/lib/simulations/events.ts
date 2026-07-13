import { promises as fs } from "node:fs";
import path from "node:path";
import { eventsFilePath } from "./paths";

/** Portal's view of the shared events contract (see simulation/src/engine/events.ts). */
export interface SimulationEvent {
  id: string;
  scheduledMicros: number;
  targetKey: string;
  targetUrl: string | null;
  payload: unknown;
}

/** Persist the precomputed events for a simulation. */
export async function writeEvents(id: string, events: SimulationEvent[]): Promise<void> {
  const file = eventsFilePath(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(events, null, 2), "utf8");
}

/**
 * Read the persisted events for a simulation. Returns an empty array when no
 * events file exists yet (e.g. the simulation has not been generated).
 */
export async function readEvents(id: string): Promise<SimulationEvent[]> {
  const file = eventsFilePath(id);
  try {
    const contents = await fs.readFile(file, "utf8");
    return JSON.parse(contents) as SimulationEvent[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
