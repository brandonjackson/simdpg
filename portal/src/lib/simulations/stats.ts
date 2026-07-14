/** Terminal run counts a finished simulation records. */
export interface SimulationStats {
  delivered: number;
  skipped: number;
  failed: number;
  total: number;
  /** Present when the run ended in `failed`. */
  error?: string;
}

function readCount(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Narrow a record's loosely-typed `stats` blob into typed counts. Returns null
 * when no stats have been recorded yet (absent or empty object).
 */
export function parseStats(
  raw: Record<string, unknown> | undefined,
): SimulationStats | null {
  if (!raw || Object.keys(raw).length === 0) return null;

  const stats: SimulationStats = {
    delivered: readCount(raw, "delivered"),
    skipped: readCount(raw, "skipped"),
    failed: readCount(raw, "failed"),
    total: readCount(raw, "total"),
  };

  if (typeof raw.error === "string") stats.error = raw.error;

  return stats;
}
