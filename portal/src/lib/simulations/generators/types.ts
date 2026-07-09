import type { Citizen, Program } from "@simdpg/api-clients";

/** A pure, sim-time event emitted by a RandomEventGenerator. */
export interface GeneratedEvent {
  /** Seconds after simulation start (simulation time). */
  scheduledSimSeconds: number;
  /** A FORM_HOOKS key identifying the webhook this event targets. */
  targetKey: string;
  /** Body POSTed to the webhook; must match that hook's payload contract. */
  payload: unknown;
}

export interface GeneratorContext {
  /** Alive citizens the generator may act on. */
  citizens: Citizen[];
  /** Active benefit programmes; empty for generators that don't need them. */
  programs: Program[];
  /** Time-step in simulation seconds (86_400 = 1 day for v1). */
  dtSeconds: number;
  /** Simulation-time window in seconds. */
  durationSeconds: number;
  /** Randomness source; injectable so generators are deterministically testable. */
  random: () => number;
}

/**
 * Generates random life events for the population. Pure and synchronous: given
 * the same context (including `random`), it returns the same events.
 */
export interface RandomEventGenerator {
  key: string;
  generate(ctx: GeneratorContext): GeneratedEvent[];
}
