/**
 * Fire-and-forget webhook emitter.
 * POSTs to process.env.WEBHOOK_URL when set; silently ignores failures.
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
  }).catch(() => {
    // Silently swallow errors — webhook delivery is best-effort
  });
}
