import { promises as fs } from "node:fs";
import { eventsFilePath } from "./paths.js";

export interface SimulationEvent {
  id: string;
  scheduledMicros: number;
  targetKey: string;
  targetUrl: string | null;
  payload: unknown;
}

/** Load the precomputed events for a simulation. Throws if missing/unparseable. */
export async function readEvents(id: string): Promise<SimulationEvent[]> {
  const raw = await fs.readFile(eventsFilePath(id), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Events file for ${id} is not an array`);
  }
  return parsed as SimulationEvent[];
}
