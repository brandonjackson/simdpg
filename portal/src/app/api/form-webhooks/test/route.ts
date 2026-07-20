import { NextRequest, NextResponse } from "next/server";
import { isFormHookKey } from "@/lib/form-hooks";
import { resolveFormWebhook } from "@/lib/form-webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/form-webhooks/test  { key, target_url?, payload }
 *
 * Relay a one-off test payload to a form's webhook so staff can verify the
 * connection from the registry UI. **Nothing is saved.** The URL is taken from
 * `target_url` when supplied (the value currently typed in the registry input),
 * otherwise it falls back to the form's resolved/registered URL. The request
 * mirrors a real submission — same `X-SimDPG-Form` header, body forwarded
 * unchanged — and the webhook's response (status + body) is returned verbatim.
 * Routing through the server (rather than fetching from the browser) avoids CORS
 * and keeps the test path identical to the real submission path.
 */
export async function POST(request: NextRequest) {
  let body: { key?: string; target_url?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key } = body;
  if (!key || !isFormHookKey(key)) {
    return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  }

  // Prefer the URL the user has typed; fall back to the resolved registration.
  let url = typeof body.target_url === "string" ? body.target_url.trim() : "";
  if (url) {
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "target_url must be a valid URL" },
        { status: 400 },
      );
    }
  } else {
    const resolved = await resolveFormWebhook(key);
    if (!resolved) {
      return NextResponse.json(
        { error: "No webhook URL to test — enter or save a URL first." },
        { status: 400 },
      );
    }
    url = resolved.url;
  }

  // Normalise the payload to a JSON string. Accept either a pre-serialised
  // string (what the editable textarea sends) or a raw object. Validate JSON
  // here so we fail with a clear message instead of forwarding garbage.
  let rawBody: string;
  if (typeof body.payload === "string") {
    rawBody = body.payload;
    try {
      JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "payload is not valid JSON" },
        { status: 400 },
      );
    }
  } else if (body.payload && typeof body.payload === "object") {
    rawBody = JSON.stringify(body.payload);
  } else {
    return NextResponse.json({ error: "payload is required" }, { status: 400 });
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
      body: await res.text(),
      contentType: res.headers.get("Content-Type") ?? "application/json",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? `Could not reach the webhook: ${err.message}`
            : "Could not reach the webhook.",
      },
      { status: 502 },
    );
  }
}
