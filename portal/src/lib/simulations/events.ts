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
 * Read the precomputed events for a simulation. Returns null when no events file
 * exists yet (i.e. the simulation hasn't been generated). Other read/parse
 * errors propagate so a genuinely corrupt file isn't silently treated as empty.
 */
export async function readEvents(id: string): Promise<SimulationEvent[] | null> {
  try {
    const raw = await fs.readFile(eventsFilePath(id), "utf8");
    return JSON.parse(raw) as SimulationEvent[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
