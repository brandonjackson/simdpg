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

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
}
