import { v4 as uuidv4 } from "uuid";

/**
 * DCI / CloudEvents-style event envelope. Every system emits webhooks in this
 * shape so OpenFn can consume them uniformly:
 *
 *   { id, type, source, time, data }
 */
export interface WebhookEvent {
  /** Unique event id (UUID). */
  id: string;
  /** Dotted event type, e.g. "citizen.created", "birth.registered". */
  type: string;
  /** Emitting system, e.g. "identity". */
  source: string;
  /** ISO 8601 emission timestamp. */
  time: string;
  /** Event-specific payload. */
  data: Record<string, unknown>;
}

export type DeliveryStatus = "delivered" | "failed" | "skipped";

export interface DeliveryResult {
  status: DeliveryStatus;
  httpStatus?: number;
  error?: string;
}

/** Build a DCI-style event envelope with a fresh id and timestamp. */
export function buildWebhookEvent(
  type: string,
  source: string,
  data: Record<string, unknown>,
): WebhookEvent {
  return { id: uuidv4(), type, source, time: new Date().toISOString(), data };
}

/**
 * Deliver an event to the configured `WEBHOOK_URL` (best-effort, awaited by
 * the caller only to record the outcome). Returns `skipped` when no target is
 * configured so the local event log still reflects reality.
 */
export async function deliverWebhook(event: WebhookEvent): Promise<DeliveryResult> {
  const url = process.env.WEBHOOK_URL;
  if (!url) return { status: "skipped", error: "WEBHOOK_URL not configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": event.id,
      },
      body: JSON.stringify(event),
    });
    return res.ok
      ? { status: "delivered", httpStatus: res.status }
      : { status: "failed", httpStatus: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
