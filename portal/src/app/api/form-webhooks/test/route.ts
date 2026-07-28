import { NextRequest, NextResponse } from "next/server";
import { isFormHookKey } from "@/lib/form-hooks";
import { resolveFormWebhook } from "@/lib/form-webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/form-webhooks/test  { key, payload, target_url? }
 *
 * One-off "Test connection" relay for the staff webhook registry. It forwards a
 * sample payload to a form's webhook so staff can confirm the endpoint is
 * reachable and see its response — without submitting a real form and without
 * saving anything.
 *
 * The request mirrors the real submission path (see `lib/form-submission`): the
 * same `X-SimDPG-Form` header, the payload forwarded unchanged. Going through
 * the server (rather than fetching from the browser) avoids CORS and keeps
 * behaviour identical to a genuine submission.
 *
 * `target_url` lets the UI test the URL currently typed in the box before it is
 * saved; when omitted it falls back to the form's resolved (registered or
 * env-var) URL.
 */
export async function POST(request: NextRequest) {
  let body: { key?: string; payload?: string; target_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, payload, target_url } = body;
  if (!key || !isFormHookKey(key)) {
    return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  }
  if (typeof payload !== "string") {
    return NextResponse.json(
      { error: "payload (a JSON string) is required" },
      { status: 400 },
    );
  }
  // Validate the payload is well-formed JSON so staff get a clear error rather
  // than posting a broken body to the workflow.
  try {
    JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: "payload is not valid JSON" },
      { status: 400 },
    );
  }

  // Prefer an explicit target (the URL currently typed in the box) so staff can
  // test before saving; otherwise use the form's resolved URL.
  let url = typeof target_url === "string" ? target_url.trim() : "";
  if (!url) {
    const resolved = await resolveFormWebhook(key);
    if (!resolved) {
      return NextResponse.json(
        {
          error:
            "No webhook URL to test. Enter a URL above (or save one) first.",
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

  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SimDPG-Form": key,
      },
      body: payload,
    });
    const responseBody = await res.text();
    return NextResponse.json({
      ok: true,
      status: res.status,
      status_text: res.statusText,
      content_type: res.headers.get("Content-Type") ?? "",
      body: responseBody,
      duration_ms: Date.now() - startedAt,
      target_url: url,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? `Could not reach the webhook: ${err.message}`
            : "Could not reach the webhook.",
        duration_ms: Date.now() - startedAt,
        target_url: url,
      },
      { status: 502 },
    );
  }
}
