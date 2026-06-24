import { NextRequest, NextResponse } from "next/server";
import { FORM_HOOKS, isFormHookKey } from "@/lib/form-hooks";
import {
  listFormWebhooks,
  resolveFormWebhook,
  setFormWebhook,
  deleteFormWebhook,
} from "@/lib/form-webhooks";

export const dynamic = "force-dynamic";

/**
 * GET /api/form-webhooks
 * Return the full form-hook catalog, each annotated with its resolved webhook
 * URL and where that URL came from (the saved registry or a legacy env var).
 */
export async function GET() {
  const saved = new Map((await listFormWebhooks()).map((r) => [r.key, r]));

  const forms = await Promise.all(
    FORM_HOOKS.map(async (hook) => {
      const resolved = await resolveFormWebhook(hook.key);
      return {
        key: hook.key,
        service_id: hook.serviceId,
        name: hook.name,
        description: hook.description,
        // The saved URL (null when only an env-var fallback is active).
        target_url: saved.get(hook.key)?.target_url ?? null,
        // The URL that submissions actually use right now, and its origin.
        resolved_url: resolved?.url ?? null,
        source: resolved?.source ?? null,
        legacy_env_var: hook.legacyEnvVar ?? null,
      };
    }),
  );

  return NextResponse.json({ forms });
}

/**
 * POST /api/form-webhooks  { key, target_url }
 * Register (or replace) the webhook URL a form submits to.
 */
export async function POST(request: NextRequest) {
  let body: { key?: string; target_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, target_url } = body;
  if (!key || !isFormHookKey(key)) {
    return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  }
  if (!target_url || typeof target_url !== "string") {
    return NextResponse.json({ error: "target_url is required" }, { status: 400 });
  }
  try {
    new URL(target_url);
  } catch {
    return NextResponse.json({ error: "target_url must be a valid URL" }, { status: 400 });
  }

  const record = await setFormWebhook(key, target_url.trim());
  return NextResponse.json(record, { status: 201 });
}

/**
 * DELETE /api/form-webhooks?key=<formKey>
 * Remove the registered URL (a legacy env-var fallback, if any, still applies).
 */
export async function DELETE(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || !isFormHookKey(key)) {
    return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  }
  await deleteFormWebhook(key);
  return NextResponse.json({ key, deleted: true });
}
