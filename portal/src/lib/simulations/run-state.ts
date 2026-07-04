import { promises as fs } from "node:fs";
import { runStateFilePath } from "./paths";

/** Portal's read-only view of the worker-owned run-state file. */
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

/** Read run-state; returns null when missing or unparseable (treated as "still running"). */
export async function readRunState(id: string): Promise<SimulationRunState | null> {
  try {
    const raw = await fs.readFile(runStateFilePath(id), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SimulationRunState) : null;
  } catch {
    return null;
  }
}
