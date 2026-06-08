import { eq } from "drizzle-orm";
import { buildWebhookEvent, deliverWebhook } from "@simdpg/system-kit";
import { db } from "./db/index.js";
import { webhookEvents } from "./db/schema.js";

const SOURCE = "identity";

/**
 * Emit a DCI-style webhook event ({ id, type, source, time, data }).
 *
 * Every event is recorded in the local `webhook_events` log first, then
 * delivered to `WEBHOOK_URL` (best-effort). The log row's status is updated
 * once delivery settles so the event log doubles as a debugging trail.
 */
export function emitWebhook(
  eventType: string,
  payload: Record<string, unknown>,
): void {
  const event = buildWebhookEvent(eventType, SOURCE, payload);

  db.insert(webhookEvents)
    .values({
      id: event.id,
      type: event.type,
      source: event.source,
      time: event.time,
      data: JSON.stringify(event.data),
      status: "pending",
      error: null,
    })
    .run();

  // Fire-and-forget delivery; record the outcome in the log.
  void deliverWebhook(event).then((result) => {
    db.update(webhookEvents)
      .set({ status: result.status, error: result.error ?? null })
      .where(eq(webhookEvents.id, event.id))
      .run();
  });
}
