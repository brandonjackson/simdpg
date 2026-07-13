/**
 * Shared name/place/cause pools and deterministic sampling helpers for the
 * random event generators. All randomness is taken from an injected `random`
 * so generators stay pure and testable. Pools are copied (not imported) from
 * the standalone simulator's `simulation/src/names.ts`, since the portal does
 * not depend on that package.
 */

export const maleGivenNames: readonly string[] = [
  "Kwame", "Kofi", "Ade", "Chidi", "Emeka", "Thabo", "Sipho", "Tendai",
  "Wei", "Jun", "Hiro", "Ravi", "Arjun", "Raj", "Takeshi", "Kenji",
  "Carlos", "Diego", "Mateo", "Santiago", "Rafael", "Miguel", "Juan",
  "James", "Oliver", "Lars", "Hans", "Pierre", "Ivan", "William", "Thomas",
];

export const femaleGivenNames: readonly string[] = [
  "Amara", "Nia", "Zara", "Adaeze", "Fatou", "Amina", "Thandiwe", "Aisha",
  "Mei", "Yuki", "Priya", "Ananya", "Sakura", "Linh", "Aiko", "Deepa",
  "Maria", "Sofia", "Valentina", "Camila", "Isabella", "Lucia", "Ana",
  "Sophie", "Emma", "Ingrid", "Greta", "Charlotte", "Freya", "Clara",
];

export const familyNames: readonly string[] = [
  "Okafor", "Mensah", "Diallo", "Traore", "Nkosi", "Mwangi", "Kone", "Osei",
  "Tanaka", "Patel", "Wang", "Kim", "Nguyen", "Singh", "Sharma", "Li",
  "Rodriguez", "Silva", "Garcia", "Mendez", "Torres", "Reyes", "Santos",
  "Mueller", "Dubois", "Smith", "Johansson", "Rossi", "Petrov", "Martin",
];

export const cityNames: readonly string[] = [
  "Westville", "Oakridge", "Sunnyvale", "Riverside", "Greenfield", "Milltown",
  "Fairview", "Springfield", "Lakewood", "Maplewood", "Cedarville", "Brookside",
  "Hillcrest", "Pinewood", "Ashton", "Bayview", "Clearwater", "Northgate",
];

export const CAUSES_OF_DEATH: readonly string[] = [
  "Natural causes", "Cardiovascular disease", "Respiratory illness",
  "Infectious disease", "Cancer", "Accident", "Stroke", "Diabetes complications",
];

export const ADULT_AGE = 18;

// Captured once at module load. Adulthood only depends on the birth *year*
// versus the current year, so this is stable for realistic DOBs and keeps
// generators effectively deterministic across a run.
const CURRENT_YEAR = new Date().getUTCFullYear();

/** True when the citizen's birth year is at least ADULT_AGE years ago. */
export function isAdult(dob: string): boolean {
  const year = Number(dob.slice(0, 4));
  return Number.isFinite(year) && year <= CURRENT_YEAR - ADULT_AGE;
}

/** Uniformly random element: index = floor(random() * length). */
export function pick<T>(arr: readonly T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)];
}

/** Integer count from an expected value: floor plus a Bernoulli on the remainder. */
export function drawCount(expected: number, random: () => number): number {
  const base = Math.floor(expected);
  return random() < expected - base ? base + 1 : base;
}

/** Up to min(k, arr.length) distinct elements (Fisher–Yates prefix shuffle). */
export function sampleWithoutReplacement<T>(
  arr: readonly T[],
  k: number,
  random: () => number,
): T[] {
  const pool = arr.slice();
  const n = Math.min(k, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// Fixed simulation epoch so date fields are deterministic (cosmetic in the sim).
const SIM_EPOCH_UTC = Date.UTC(2025, 0, 1);

/** `YYYY-MM-DD` for a simulation day index, measured from the fixed epoch. */
export function simDayToDate(dayIndex: number): string {
  return new Date(SIM_EPOCH_UTC + dayIndex * 86_400_000).toISOString().slice(0, 10);
}
