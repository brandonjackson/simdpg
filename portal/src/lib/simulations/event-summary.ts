import { getFormHook } from "@/lib/form-hooks";
import { readEvents, type SimulationEvent } from "./events";

/** Per-target-type breakdown of a generated simulation's events. */
export interface EventTypeSummary {
  /** The FORM_HOOKS key the events target (e.g. "national-id"). */
  targetKey: string;
  /** Human-readable name from the form-hook catalog; falls back to the key. */
  label: string;
  /** How many events of this type were generated. */
  count: number;
  /**
   * Whether a webhook URL was resolved for this target at generation time. When
   * false, these events are skipped at run time (see the scheduler's `deliver`).
   */
  hasTarget: boolean;
}

/** A human-oriented summary of the events a simulation generated. */
export interface EventSummary {
  /** Total events generated. */
  total: number;
  /** Breakdown by target type, most frequent first. */
  byType: EventTypeSummary[];
  /** Events with no registered webhook — skipped when the simulation runs. */
  unresolved: number;
  /**
   * Wall-clock microseconds from run start to the first / last scheduled event.
   * Null when no events were generated.
   */
  firstScheduledMicros: number | null;
  lastScheduledMicros: number | null;
}

/**
 * Summarize a precomputed event list. Pure — the same events always produce the
 * same summary. Target labels come from the form-hook catalog.
 */
export function summarizeEvents(events: SimulationEvent[]): EventSummary {
  const byKey = new Map<string, { count: number; hasTarget: boolean }>();
  let unresolved = 0;
  let first: number | null = null;
  let last: number | null = null;

  for (const event of events) {
    const resolved = event.targetUrl !== null;
    const entry = byKey.get(event.targetKey);
    if (entry) {
      entry.count += 1;
      // All events for a key normally share one resolution; OR-ing is defensive.
      entry.hasTarget = entry.hasTarget || resolved;
    } else {
      byKey.set(event.targetKey, { count: 1, hasTarget: resolved });
    }

    if (!resolved) unresolved += 1;
    if (first === null || event.scheduledMicros < first) first = event.scheduledMicros;
    if (last === null || event.scheduledMicros > last) last = event.scheduledMicros;
  }

  const byType: EventTypeSummary[] = [...byKey.entries()]
    .map(([targetKey, { count, hasTarget }]) => ({
      targetKey,
      label: getFormHook(targetKey)?.name ?? targetKey,
      count,
      hasTarget,
    }))
    .sort((a, b) => b.count - a.count || a.targetKey.localeCompare(b.targetKey));

  return {
    total: events.length,
    byType,
    unresolved,
    firstScheduledMicros: first,
    lastScheduledMicros: last,
  };
}

/**
 * Read a simulation's persisted events and summarize them. Returns null when no
 * events file exists yet (i.e. the simulation hasn't been generated).
 */
export async function getEventSummary(id: string): Promise<EventSummary | null> {
  const events = await readEvents(id);
  return events ? summarizeEvents(events) : null;
}
