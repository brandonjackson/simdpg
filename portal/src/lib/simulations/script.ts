import { promises as fs } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { simulationScripts } from "../db/schema";
import type { SimulationEvent } from "./events";
import { eventsFilePath, generationFilePath } from "./paths";

/**
 * What generation drew on and produced for one simulation.
 *
 * The event script alone cannot say why it is short or empty — an empty array
 * looks the same whether the population was empty, the run was too brief for the
 * configured rates, or every draw simply missed. This records the inputs so the
 * detail page can say which it was.
 */
export interface GenerationSummary {
  /** When generation ran. */
  generatedAt: string;
  /** Alive citizens the generators drew on. */
  citizens: number;
  /** Active benefit programmes the generators drew on. */
  programs: number;
  /** Simulated days covered, including a trailing part-day. */
  days: number;
  /** Events written to the script. */
  events: number;
  /** Target keys with no webhook registered for the run's project. */
  unroutedTargets: string[];
  /** Events aimed at those targets — the worker skips them at run time. */
  unroutedEvents: number;
}

/** A generated run: the events to deliver, and what producing them drew on. */
export interface SimulationScript {
  events: SimulationEvent[];
  /** Null for scripts stored before summaries existed. */
  generation: GenerationSummary | null;
}

/**
 * Persist a simulation's script. Events and summary are written together, in
 * one row, so a stored script always carries its own explanation — the sidecar
 * file they replace could go missing on its own.
 */
export async function writeScript(
  id: string,
  events: SimulationEvent[],
  generation: GenerationSummary | null,
): Promise<void> {
  const row = {
    simulation_id: id,
    events: JSON.stringify(events),
    generation: generation ? JSON.stringify(generation) : null,
    updated_at: new Date().toISOString(),
  };

  getDb()
    .insert(simulationScripts)
    .values(row)
    .onConflictDoUpdate({ target: simulationScripts.simulation_id, set: row })
    .run();
}

/**
 * Read a stored script, falling back to the pre-database files for a run
 * generated before scripts moved into the volume — on a host where those files
 * still exist, such a run stays runnable. Null when there is no script at all:
 * either the simulation was never generated, or its files are gone.
 */
export async function readScript(id: string): Promise<SimulationScript | null> {
  const row = getDb()
    .select()
    .from(simulationScripts)
    .where(eq(simulationScripts.simulation_id, id))
    .get();

  if (row) {
    return {
      events: JSON.parse(row.events) as SimulationEvent[],
      generation: row.generation
        ? (JSON.parse(row.generation) as GenerationSummary)
        : null,
    };
  }

  return readLegacyScript(id);
}

/** The script's events, or an empty array when there is no script. */
export async function readEvents(id: string): Promise<SimulationEvent[]> {
  return (await readScript(id))?.events ?? [];
}

/**
 * Whether a runnable script exists. Distinct from an empty `events` array,
 * which is a legitimate outcome of generation (no draws landed) and runs fine.
 */
export async function hasScript(id: string): Promise<boolean> {
  return (await readScript(id)) !== null;
}

/** Drop a simulation's script, including any pre-database files. */
export async function deleteScript(id: string): Promise<void> {
  getDb()
    .delete(simulationScripts)
    .where(eq(simulationScripts.simulation_id, id))
    .run();
  await fs.rm(eventsFilePath(id), { force: true });
  await fs.rm(generationFilePath(id), { force: true });
}

/** Read a script from the files scripts were kept in before the database. */
async function readLegacyScript(id: string): Promise<SimulationScript | null> {
  const events = await readJsonFile<SimulationEvent[]>(eventsFilePath(id));
  if (!Array.isArray(events)) return null;
  return {
    events,
    generation: await readJsonFile<GenerationSummary>(generationFilePath(id)),
  };
}

/** Parse a JSON file, or null when it is missing or unreadable. */
async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}
