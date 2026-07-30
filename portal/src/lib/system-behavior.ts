/**
 * Applying one stochastic-behaviour config to every system.
 *
 * A simulation defines its behaviour once (see `SimulationParameters.behavior`)
 * and it lands on all seven systems: the worker pushes it when a run starts and
 * clears it when the run ends, and the portal can read or clear it at any time
 * from the staff area. Each system holds its config in memory behind
 * `/admin/behavior` — see `createBehavior` in `@simdpg/system-kit`.
 */

import { SYSTEM_URLS } from "@simdpg/api-clients";
import type { BehaviorConfig } from "@simdpg/system-kit/behavior";

export interface SystemTarget {
  id: string;
  label: string;
  url: string;
}

/** Every system, in the order the staff pages list them. */
export const BEHAVIOR_TARGETS: readonly SystemTarget[] = [
  { id: "identity", label: "Identity", url: SYSTEM_URLS.identity },
  { id: "civil-registry", label: "Civil Registry", url: SYSTEM_URLS.civilRegistry },
  { id: "health", label: "Health", url: SYSTEM_URLS.health },
  { id: "benefits", label: "Benefits", url: SYSTEM_URLS.benefits },
  { id: "notifications", label: "Notifications", url: SYSTEM_URLS.notifications },
  { id: "payments", label: "Payments", url: SYSTEM_URLS.payments },
  { id: "social-registry", label: "Social Registry", url: SYSTEM_URLS.socialRegistry },
];

/**
 * A system's reply from `/admin/behavior`. Mirrors `BehaviorState` in
 * system-kit; declared here as the wire shape so this module (and the client
 * components reading it) don't pull in the express-facing half of that package.
 */
export interface SystemBehaviorState {
  system: string;
  enabled: boolean;
  config: BehaviorConfig;
  preset: string | null;
  source: string | null;
  applied_at: string | null;
  expires_at: string | null;
  counters: {
    requests: number;
    delayed: number;
    delay_ms_total: number;
    injected_errors: number;
    rate_limited: number;
  };
}

export interface SystemBehaviorResult {
  id: string;
  label: string;
  ok: boolean;
  state?: SystemBehaviorState;
  error?: string;
}

/** Don't let one unreachable system hold up the fan-out. */
const REQUEST_TIMEOUT_MS = 5000;

async function callSystem(
  target: SystemTarget,
  init: RequestInit,
): Promise<SystemBehaviorResult> {
  try {
    const res = await fetch(`${target.url}/admin/behavior`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const state = (await res.json()) as SystemBehaviorState;
    return { id: target.id, label: target.label, ok: true, state };
  } catch (err) {
    return {
      id: target.id,
      label: target.label,
      ok: false,
      error: err instanceof Error ? err.message : "request failed",
    };
  }
}

function fanOut(
  init: RequestInit,
  targets: readonly SystemTarget[],
): Promise<SystemBehaviorResult[]> {
  return Promise.all(targets.map((target) => callSystem(target, init)));
}

/** Read what every system is currently doing. Never throws. */
export function readSystemBehavior(
  targets: readonly SystemTarget[] = BEHAVIOR_TARGETS,
): Promise<SystemBehaviorResult[]> {
  return fanOut({ method: "GET" }, targets);
}

export interface ApplySystemBehaviorOptions {
  /** Note recorded on each system, e.g. `simulation 1a2b3c4d`. */
  source?: string;
  /**
   * When the config should clear itself. Belt and braces for the worker's
   * explicit reset: if the process is killed outright, systems still return to
   * normal on their own rather than staying faulty forever.
   */
  expiresAt?: string;
}

/** Apply one config to every system. Never throws; failures come back per system. */
export function applySystemBehavior(
  config: BehaviorConfig,
  options: ApplySystemBehaviorOptions = {},
  targets: readonly SystemTarget[] = BEHAVIOR_TARGETS,
): Promise<SystemBehaviorResult[]> {
  return fanOut(
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...config,
        source: options.source,
        expires_at: options.expiresAt,
      }),
    },
    targets,
  );
}

/** Return every system to its default behaviour. Never throws. */
export function clearSystemBehavior(
  targets: readonly SystemTarget[] = BEHAVIOR_TARGETS,
): Promise<SystemBehaviorResult[]> {
  return fanOut({ method: "DELETE" }, targets);
}

/** Systems that report behaviour currently in force. */
export function enabledSystems(
  results: readonly SystemBehaviorResult[],
): SystemBehaviorResult[] {
  return results.filter((result) => result.state?.enabled);
}
