import { NextRequest, NextResponse } from "next/server";
import { ApiError, type WebhookSubscription } from "@simdpg/api-clients";
import { SYSTEMS_BY_ID, type SystemId } from "@/lib/systems";
import { defaultProjectId, getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

function isSystemId(value: string): value is SystemId {
  return Object.prototype.hasOwnProperty.call(SYSTEMS_BY_ID, value);
}

/**
 * Resolve the project a request targets: the `project_id` parameter when given
 * (404-ing on an unknown one rather than silently using the default), else the
 * default project.
 */
async function resolveProjectId(
  raw: string | null | undefined,
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
 * GET /api/webhooks?project_id=<id>
 * Fan out to every system's `/admin/webhook-subscriptions` and return a flat,
 * system-tagged list of the registrations belonging to one project. Systems that
 * are unreachable are reported in `errors` rather than failing the whole request.
 *
 * Subscriptions registered before projects existed carry no project id. They are
 * shown under the default project — the same rule the form-webhook registry uses
 * for legacy env vars — so they stay visible and removable instead of becoming
 * orphaned rows no project lists.
 */
export async function GET(request: NextRequest) {
  const resolved = await resolveProjectId(
    request.nextUrl.searchParams.get("project_id"),
  );
  if ("error" in resolved) return resolved.error;
  const projectId = resolved.id;
  const isDefault = projectId === (await defaultProjectId());

  const entries = Object.entries(SYSTEMS_BY_ID) as [
    SystemId,
    (typeof SYSTEMS_BY_ID)[SystemId],
  ][];

  const belongsToProject = (sub: WebhookSubscription): boolean =>
    sub.project_id === projectId || (isDefault && !sub.project_id);

  const results = await Promise.all(
    entries.map(async ([system, client]) => {
      try {
        // The default project needs the unfiltered list so untagged legacy rows
        // come back too; every other project filters at the system.
        const subs = isDefault
          ? await client.listWebhookSubscriptions()
          : await client.listWebhookSubscriptions(projectId);
        return {
          system,
          subscriptions: subs
            .filter(belongsToProject)
            .map((s) => ({ ...s, system })),
          error: null as string | null,
        };
      } catch {
        return { system, subscriptions: [], error: system };
      }
    }),
  );

  return NextResponse.json({
    project_id: projectId,
    subscriptions: results.flatMap((r) => r.subscriptions),
    errors: results.filter((r) => r.error).map((r) => r.error),
  });
}

/**
 * POST /api/webhooks  { system, event_type, target_url, project_id? }
 * Register a webhook target on the system that owns the event, tagged with the
 * project it belongs to.
 */
export async function POST(request: NextRequest) {
  let body: {
    system?: string;
    event_type?: string;
    target_url?: string;
    project_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { system, event_type, target_url } = body;
  if (!system || !isSystemId(system)) {
    return NextResponse.json({ error: "Unknown system" }, { status: 400 });
  }
  if (!event_type || !target_url) {
    return NextResponse.json(
      { error: "event_type and target_url are required" },
      { status: 400 },
    );
  }

  const resolved = await resolveProjectId(body.project_id);
  if ("error" in resolved) return resolved.error;

  try {
    const created = await SYSTEMS_BY_ID[system].createWebhookSubscription({
      event_type,
      target_url,
      project_id: resolved.id,
    });
    return NextResponse.json({ ...created, system }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json({ error: "System unavailable" }, { status: 502 });
  }
}

/**
 * DELETE /api/webhooks?system=<id>&id=<subscriptionId>
 */
export async function DELETE(request: NextRequest) {
  const system = request.nextUrl.searchParams.get("system");
  const id = request.nextUrl.searchParams.get("id");

  if (!system || !isSystemId(system)) {
    return NextResponse.json({ error: "Unknown system" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await SYSTEMS_BY_ID[system].deleteWebhookSubscription(id);
    return NextResponse.json({ id, deleted: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    return NextResponse.json({ error: "System unavailable" }, { status: 502 });
  }
}
