/**
 * Shared utility functions for the simulation engine.
 */

/** Pick a random element from an array. */
export function randomChoice<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("randomChoice called on empty array");
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random integer in [min, max] inclusive. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Weighted random selection.
 * `items` and `weights` must be the same length.
 * Returns one randomly selected item based on the weight distribution.
 */
export function weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
  if (items.length !== weights.length) {
    throw new Error("items and weights must have the same length");
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Promisified setTimeout. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calculate age from a date-of-birth string (YYYY-MM-DD) as of a given date. */
export function ageFromDob(dob: string, asOf?: Date): number {
  const ref = asOf ?? new Date();
  const birth = new Date(dob);
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/** Format a Date to ISO date string (YYYY-MM-DD). */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Log a message to stderr so stdout remains clean for piped output. */
export function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Log an error to stderr. */
export function logError(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[ERROR] ${message}: ${detail}\n`);
}
