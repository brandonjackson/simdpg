import { NextRequest, NextResponse } from "next/server";
import { FORM_HOOKS, isFormHookKey } from "@/lib/form-hooks";
import {
  listFormWebhooks,
  resolveFormWebhook,
  setFormWebhook,
  deleteFormWebhook,
} from "@/lib/form-webhooks";
import { defaultProjectId, getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

/**
 * Resolve the project a request targets: the `project_id` parameter when given
 * (404-ing on an unknown one rather than silently writing to the default), else
 * the default project.
 */
async function resolveProjectId(
  raw: string | null,
): Promise<{ id: string } | { error: NextResponse }> {
  if (!raw) return { id: await defaultProjectId() };
  const project = await getProject(raw);
  if (!project) {
    return {
      error: NextResponse.json({ error: "Unknown project" }, { status: 404 }),
    };
  }
  return { id: project.id };
}

/**
 * GET /api/form-webhooks?project_id=<id>
 * Return the full form-hook catalog for one project, each annotated with its
 * resolved webhook URL and where that URL came from (the project's registry or a
 * legacy env var). Defaults to the default project.
 */
export async function GET(request: NextRequest) {
  const resolved = await resolveProjectId(
    request.nextUrl.searchParams.get("project_id"),
  );
  if ("error" in resolved) return resolved.error;
  const projectId = resolved.id;

  const saved = new Map(
    (await listFormWebhooks(projectId)).map((r) => [r.key, r]),
  );

  const forms = await Promise.all(
    FORM_HOOKS.map(async (hook) => {
      const target = await resolveFormWebhook(hook.key, projectId);
      return {
        key: hook.key,
        service_id: hook.serviceId,
        name: hook.name,
        description: hook.description,
        // The saved URL (null when only an env-var fallback is active).
        target_url: saved.get(hook.key)?.target_url ?? null,
        // The URL that submissions actually use right now, and its origin.
        resolved_url: target?.url ?? null,
        source: target?.source ?? null,
        legacy_env_var: hook.legacyEnvVar ?? null,
      };
    }),
  );

  return NextResponse.json({ project_id: projectId, forms });
}

/**
 * POST /api/form-webhooks  { key, target_url, project_id? }
 * Register (or replace) the webhook URL a form submits to within a project.
 */
export async function POST(request: NextRequest) {
  let body: { key?: string; target_url?: string; project_id?: string };
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

  const resolved = await resolveProjectId(body.project_id ?? null);
  if ("error" in resolved) return resolved.error;

  try {
    const record = await setFormWebhook(resolved.id, key, target_url.trim());
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the webhook URL" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/form-webhooks?key=<formKey>&project_id=<id>
 * Remove the registered URL (for the default project a legacy env-var fallback,
 * if any, still applies).
 */
export async function DELETE(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || !isFormHookKey(key)) {
    return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  }

  const resolved = await resolveProjectId(
    request.nextUrl.searchParams.get("project_id"),
  );
  if ("error" in resolved) return resolved.error;

  try {
    await deleteFormWebhook(resolved.id, key);
    return NextResponse.json({ project_id: resolved.id, key, deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not remove the webhook URL" },
      { status: 500 },
    );
  }
}
