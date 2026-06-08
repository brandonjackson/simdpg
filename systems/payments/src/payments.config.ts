/**
 * Payments gateway simulation config.
 *
 * The Payments system mocks a real government payment gateway: no money ever
 * moves for real, and — crucially — the disbursement API *fails at random*,
 * exactly like a live banking partner would. Each disbursement rolls once
 * against the failure modes below; on a hit the payment is recorded as
 * `failed` (with the gateway's error code) and no ledger entries are written.
 *
 * The five modes mirror the most common errors a real government payment
 * gateway hits. Tune their `rate`s here to make integration workflows
 * (OpenFn retries, idempotency, failure notifications) easier or harder to
 * exercise. Rates are independent probabilities; their sum is the overall
 * synthetic failure rate (and must stay <= 1).
 *
 * Set `PAYMENTS_DISABLE_FAILURES=1` to turn off random failures entirely
 * (handy for deterministic demos, tests, and seeding). The genuine
 * INSUFFICIENT_FUNDS / ACCOUNT_NOT_FOUND checks still apply so the ledger
 * stays consistent.
 */

export interface FailureMode {
  /** Stable machine code returned to clients and carried on payment.failed. */
  code: string;
  /** Human-readable message, phrased like a real gateway response. */
  message: string;
  /** HTTP status the gateway responds with for this failure. */
  httpStatus: number;
  /** Independent probability (0..1) this mode fires on a given disbursement. */
  rate: number;
}

export const FAILURE_MODES: FailureMode[] = [
  {
    code: "INSUFFICIENT_FUNDS",
    message:
      "The disbursing treasury account has insufficient funds to complete this transfer.",
    httpStatus: 402,
    rate: 0.02,
  },
  {
    code: "ACCOUNT_NOT_FOUND",
    message:
      "The beneficiary account or bank details could not be found or are invalid.",
    httpStatus: 404,
    rate: 0.03,
  },
  {
    code: "GATEWAY_TIMEOUT",
    message: "The upstream banking partner did not respond in time.",
    httpStatus: 504,
    rate: 0.05,
  },
  {
    code: "DUPLICATE_TRANSACTION",
    message:
      "A payment with this idempotency key has already been processed by the gateway.",
    httpStatus: 409,
    rate: 0.02,
  },
  {
    code: "SERVICE_UNAVAILABLE",
    message:
      "The payment gateway is temporarily unavailable or rate limited. Please retry later.",
    httpStatus: 503,
    rate: 0.03,
  },
];

/** Look up a failure mode definition by its code. */
export function failureModeByCode(code: string): FailureMode | undefined {
  return FAILURE_MODES.find((m) => m.code === code);
}

/**
 * Roll once against the configured failure modes. Returns the mode that fired
 * (the first to hit when modes are evaluated in order) or `null` when the
 * disbursement should be allowed to proceed to the real balance/account
 * checks. Honours `PAYMENTS_DISABLE_FAILURES`.
 */
export function rollFailure(rng: () => number = Math.random): FailureMode | null {
  if (process.env.PAYMENTS_DISABLE_FAILURES === "1") return null;
  for (const mode of FAILURE_MODES) {
    if (rng() < mode.rate) return mode;
  }
  return null;
}
