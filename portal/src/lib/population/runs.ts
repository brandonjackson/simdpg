/**
 * Lightweight persistence for the population generation / deletion run log.
 *
 * Stores recent runs in a JSON file next to the portal process so the log
 * survives dev-server reloads. Best-effort: failures to read/write are
 * swallowed so the log never breaks the actual operation.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PopulationConfig } from "./config";
import type { GenerationResult } from "./generator";

export interface RunRecord {
  id: string;
  timestamp: string;
  type: "generate" | "delete";
  outcome: "success" | "partial" | "failed";
  configSummary?: string;
  config?: PopulationConfig;
  result?: GenerationResult;
  message?: string;
}

const RUNS_FILE = path.join(process.cwd(), ".population-runs.json");
const MAX_RUNS = 50;

export async function listRuns(): Promise<RunRecord[]> {
  try {
    const raw = await fs.readFile(RUNS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

export async function addRun(record: Omit<RunRecord, "id" | "timestamp">): Promise<RunRecord> {
  const full: RunRecord = {
    ...record,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  try {
    const existing = await listRuns();
    const next = [full, ...existing].slice(0, MAX_RUNS);
    await fs.writeFile(RUNS_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // ignore persistence errors
  }
  return full;
}
