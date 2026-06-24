/**
 * Central submission point for portal forms.
 *
 * Every service form submits through here rather than calling an OpenFn URL
 * directly: the URL is resolved from the form-webhook registry (with a legacy
 * env-var fallback) and the submission is POSTed to it. The workflow's reply is
 * returned verbatim so synchronous forms (e.g. benefit eligibility) can read
 * it. The raw form payload is forwarded unchanged — the form key travels in the
 * `X-SimDPG-Form` header — so existing OpenFn workflows keep working.
 */

import { resolveFormWebhook } from "./form-webhooks";

export type SubmitOutcome =
  | { ok: true; status: number; body: string; contentType: string }
  | { ok: false; reason: "unconfigured" | "unreachable" };

/**
 * Resolve the registered webhook for `key` and forward `rawBody` to it.
 * `rawBody` is the JSON string submitted by the form.
 */
export async function submitForm(
  key: string,
  rawBody: string,
): Promise<SubmitOutcome> {
  const resolved = await resolveFormWebhook(key);
  if (!resolved) return { ok: false, reason: "unconfigured" };

  try {
    const res = await fetch(resolved.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SimDPG-Form": key,
      },
      body: rawBody,
    });
    return {
      ok: true,
      status: res.status,
      body: await res.text(),
      contentType: res.headers.get("Content-Type") ?? "application/json",
    };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
