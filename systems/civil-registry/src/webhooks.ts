import { eq } from "drizzle-orm";
import { buildWebhookEvent, deliverWebhookToTargets } from "@simdpg/system-kit";
import { db } from "./db/index.js";
import { webhookEvents, webhookSubscriptions } from "./db/schema.js";

const SOURCE = "civil-registry";

/**
 * Emit a DCI-style webhook event ({ id, type, source, time, data }).
 *
 * The event is recorded in the local `webhook_events` log, then delivered to
 * every registered subscription for its event type (see
 * `/admin/webhook-subscriptions`). The legacy `WEBHOOK_URL` env var, if set,
 * is treated as an additional catch-all target. The log row's status is
 * updated once delivery settles so the event log doubles as a debugging trail.
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

  // Resolve every registered target for this event type, plus the optional
  // legacy WEBHOOK_URL catch-all, de-duplicated.
  const subs = db
    .select({ url: webhookSubscriptions.target_url })
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.event_type, eventType))
    .all();
  const targets = subs.map((s) => s.url);
  if (process.env.WEBHOOK_URL) targets.push(process.env.WEBHOOK_URL);
  const unique = [...new Set(targets)];

  // Fire-and-forget delivery; record the aggregate outcome in the log.
  void deliverWebhookToTargets(event, unique).then((result) => {
    db.update(webhookEvents)
      .set({ status: result.status, error: result.error ?? null })
      .where(eq(webhookEvents.id, event.id))
      .run();
  });
}
