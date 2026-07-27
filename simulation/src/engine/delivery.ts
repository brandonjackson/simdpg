import type { SimulationEvent } from "./events.js";
import { log } from "../utils.js";

export type EventOutcome = "delivered" | "skipped" | "failed";

/** Default per-POST timeout; a hung endpoint must not stall the whole run. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** What one delivery needs. Schedulers extend this with their own clock deps. */
export interface DeliveryDeps {
  fetch: typeof fetch;
  /** Per-POST abort timeout in ms. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** Deliver one event: skip when unregistered, POST otherwise. Never throws. */
export async function deliver(event: SimulationEvent, deps: DeliveryDeps): Promise<EventOutcome> {
  if (event.targetUrl === null) {
    log(`skip ${event.id} (${event.targetKey}): no webhook registered`);
    return "skipped";
  }
  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await deps.fetch(event.targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.payload),
      signal: controller.signal,
    });
    if (res.ok) return "delivered";
    log(`fail ${event.id} (${event.targetKey}): HTTP ${res.status}`);
    return "failed";
  } catch (err) {
    log(`fail ${event.id} (${event.targetKey}): ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
