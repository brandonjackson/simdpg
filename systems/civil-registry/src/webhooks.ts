/**
 * Fire-and-forget webhook event emitter.
 * POSTs to process.env.WEBHOOK_URL if configured.
 */
export function emitWebhook(
  eventType: string,
  payload: Record<string, unknown>,
): void {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify({
    event_type: eventType,
    timestamp: new Date().toISOString(),
    payload,
  });

  // Fire-and-forget — intentionally not awaited
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch((err) => {
    console.error(`[webhook] Failed to emit ${eventType}:`, err.message);
  });
}
