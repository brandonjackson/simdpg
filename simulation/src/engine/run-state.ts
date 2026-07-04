import { promises as fs } from "node:fs";
import path from "node:path";
import { runStateFilePath } from "./paths.js";

export interface SimulationRunState {
  pid: number;
  status: "running" | "completed" | "stopped" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
}

/** Persist run state. The worker is the ONLY writer of this file. */
export async function writeRunState(id: string, state: SimulationRunState): Promise<void> {
  const file = runStateFilePath(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}
