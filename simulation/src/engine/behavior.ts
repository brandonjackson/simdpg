/**
 * Applying a run's stochastic behaviour to the systems, and taking it away again.
 *
 * The behaviour is defined once, in the simulation's parameters, and the worker
 * owns its lifetime: it goes on to all seven systems just before the first event
 * is delivered, and comes off when the run ends however it ends — completed,
 * stopped, or failed. Each system is also told when the config should expire, so
 * a worker that is killed outright still can't leave the systems degraded.
 */

import { eq } from "drizzle-orm";
import { SYSTEM_URLS } from "@simdpg/api-clients";
import {
  BEHAVIOR_OFF,
  describeBehavior,
  isBehaviorOff,
  parseBehavior,
  type BehaviorConfig,
} from "@simdpg/system-kit/behavior";
import { getDb, simulations } from "./db.js";
import { log, logError } from "../utils.js";

/** Every system's behaviour endpoint, keyed by the name used in log lines. */
export const SYSTEM_BEHAVIOR_TARGETS: readonly { label: string; url: string }[] = [
  { label: "identity", url: SYSTEM_URLS.identity },
  { label: "civil-registry", url: SYSTEM_URLS.civilRegistry },
  { label: "health", url: SYSTEM_URLS.health },
  { label: "benefits", url: SYSTEM_URLS.benefits },
  { label: "notifications", url: SYSTEM_URLS.notifications },
  { label: "payments", url: SYSTEM_URLS.payments },
  { label: "social-registry", url: SYSTEM_URLS.socialRegistry },
];

/**
 * Grace period added to a config's expiry, past the run's scheduled end: long
 * enough that a run which overshoots its schedule (slow webhook endpoints, a
 * queue of in-flight deliveries) doesn't have the systems recover underneath it.
 */
export const BEHAVIOR_EXPIRY_GRACE_MS = 5 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 5000;

/** The behaviour block stored in a simulation's parameters; off when absent. */
export function readSimulationBehavior(id: string): BehaviorConfig {
  const row = getDb()
    .select({ parameters: simulations.parameters })
    .from(simulations)
    .where(eq(simulations.id, id))
    .get();
  if (!row) return BEHAVIOR_OFF;

  try {
    const parameters = JSON.parse(row.parameters) as { behavior?: unknown };
    return parameters.behavior === undefined
      ? BEHAVIOR_OFF
      : parseBehavior(parameters.behavior);
  } catch {
    // A record we can't read is not a reason to fail the run; the systems simply
    // stay as they are.
    return BEHAVIOR_OFF;
  }
}

/**
 * When the systems should drop this config by themselves. `lastEventMs` is the
 * scheduled offset of the run's final event, so a run that finishes early still
 * has its behaviour cleared explicitly, and one that runs long is covered.
 */
export function behaviorExpiry(
  lastEventMs: number,
  nowMs: number = Date.now(),
): string {
  return new Date(nowMs + Math.max(0, lastEventMs) + BEHAVIOR_EXPIRY_GRACE_MS).toISOString();
}

async function callSystem(
  target: { label: string; url: string },
  init: RequestInit,
): Promise<boolean> {
  try {
    const res = await fetch(`${target.url}/admin/behavior`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    logError(`behaviour request to ${target.label} failed`, err);
    return false;
  }
}

/**
 * Push one config to every system. Returns the systems that accepted it. A
 * system that can't be reached is logged and skipped — a simulation is worth
 * running against the systems that are up.
 */
export async function applyBehavior(
  config: BehaviorConfig,
  options: { source: string; expiresAt: string },
  targets: readonly { label: string; url: string }[] = SYSTEM_BEHAVIOR_TARGETS,
): Promise<string[]> {
  const body = JSON.stringify({
    ...config,
    source: options.source,
    expires_at: options.expiresAt,
  });

  const applied = await Promise.all(
    targets.map(async (target) => {
      const ok = await callSystem(target, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
      });
      return ok ? target.label : null;
    }),
  );

  return applied.filter((label): label is string => label !== null);
}

/** Return every system to its default behaviour. */
export async function clearBehavior(
  targets: readonly { label: string; url: string }[] = SYSTEM_BEHAVIOR_TARGETS,
): Promise<string[]> {
  const cleared = await Promise.all(
    targets.map(async (target) => {
      const ok = await callSystem(target, { method: "DELETE" });
      return ok ? target.label : null;
    }),
  );

  return cleared.filter((label): label is string => label !== null);
}

/**
 * Apply a run's behaviour, if it has any, and hand back the undo. The returned
 * function is safe to call more than once and never throws, so the worker can
 * put it in a `finally` without guarding the happy path.
 */
export async function beginBehavior(
  id: string,
  lastEventMs: number,
): Promise<() => Promise<void>> {
  const config = readSimulationBehavior(id);
  if (isBehaviorOff(config)) return async () => {};

  const expiresAt = behaviorExpiry(lastEventMs);
  const applied = await applyBehavior(config, {
    source: `simulation ${id.slice(0, 8)}`,
    expiresAt,
  });

  log(
    `Simulation ${id}: system behaviour — ${describeBehavior(config)} ` +
      `(${applied.length}/${SYSTEM_BEHAVIOR_TARGETS.length} systems, expires ${expiresAt})`,
  );

  let done = false;
  return async () => {
    if (done) return;
    done = true;
    const cleared = await clearBehavior();
    log(
      `Simulation ${id}: system behaviour cleared ` +
        `(${cleared.length}/${SYSTEM_BEHAVIOR_TARGETS.length} systems back to default)`,
    );
  };
}
