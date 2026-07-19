import { NextRequest, NextResponse } from "next/server";
import { isFormHookKey } from "@/lib/form-hooks";
import { resolveFormWebhook } from "@/lib/form-webhooks";

export const dynamic = "force-dynamic";
// A test POST hits the same workflow a real submission would, which may make
// several sequential calls before replying; give it the same headroom.
export const maxDuration = 60;

/**
 * POST /api/form-webhooks/test  { key, target_url?, payload }
 *
 * Send a one-off test payload to a form's webhook so staff can confirm it is
 * wired up correctly before any real submission arrives. This mirrors the real
 * submit path (`lib/form-submission`) — same `X-SimDPG-Form` header, payload
 * forwarded unchanged — but sends to the URL the staff member is about to save
 * (or has just typed) rather than the persisted one, so they can test before
 * committing. When no `target_url` is supplied it falls back to the URL the
 * form currently resolves to.
 *
 * The upstream response is relayed as data (status, headers, body) rather than
 * proxied, so the UI can render it inline regardless of the outcome.
 */
export async function POST(request: NextRequest) {
  let body: { key?: string; target_url?: string; payload?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, target_url, payload } = body;
  if (!key || !isFormHookKey(key)) {
    return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  }

  // Prefer the caller-supplied URL (the draft in the input) so a URL can be
  // tested before it is saved; otherwise use whatever the form resolves to now.
  let url = typeof target_url === "string" ? target_url.trim() : "";
  if (!url) {
    const resolved = await resolveFormWebhook(key);
    if (!resolved) {
      return NextResponse.json(
        {
          error:
            "No webhook URL to test — enter a URL above (or save one) first.",
        },
        { status: 400 },
      );
    }
    url = resolved.url;
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { error: "The webhook URL is not a valid URL." },
      { status: 400 },
    );
  }

  // The payload must be a JSON string the workflow can parse; validate it here
  // so the staff member gets a clear message instead of a confusing upstream
  // error. Default to an empty object when omitted.
  const rawBody = typeof payload === "string" ? payload : "{}";
  try {
    JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "The payload is not valid JSON." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SimDPG-Form": key,
      },
      body: rawBody,
    });
    return NextResponse.json({
      ok: true,
      url,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("Content-Type") ?? "",
      body: await res.text(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        url,
        error:
          err instanceof Error
            ? `The webhook is unreachable: ${err.message}`
            : "The webhook is unreachable.",
      },
      { status: 502 },
    );
  }
}
