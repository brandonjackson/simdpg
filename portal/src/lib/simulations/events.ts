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
