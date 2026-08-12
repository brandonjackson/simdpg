import { promises as fs } from "node:fs";
import path from "node:path";
import { generationFilePath } from "./paths";

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

export async function writeGenerationSummary(
  id: string,
  summary: GenerationSummary,
): Promise<void> {
  const file = generationFilePath(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(summary, null, 2), "utf8");
}

/**
 * Read a simulation's generation summary, or null when there is none — either
 * the run predates the summary or it has not been generated yet. A malformed
 * file also reads as null: an explanation is a nicety, never a reason to fail
 * the request that carries it.
 */
export async function readGenerationSummary(
  id: string,
): Promise<GenerationSummary | null> {
  try {
    const contents = await fs.readFile(generationFilePath(id), "utf8");
    return JSON.parse(contents) as GenerationSummary;
  } catch {
    return null;
  }
}
