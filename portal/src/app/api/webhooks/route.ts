import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@simdpg/api-clients";
import { SYSTEMS_BY_ID, type SystemId } from "@/lib/systems";

export const dynamic = "force-dynamic";

function isSystemId(value: string): value is SystemId {
  return Object.prototype.hasOwnProperty.call(SYSTEMS_BY_ID, value);
}

/**
 * GET /api/webhooks
 * Fan out to every system's `/admin/webhook-subscriptions` and return a flat,
 * system-tagged list. Systems that are unreachable are reported in `errors`
 * rather than failing the whole request.
 */
export async function GET() {
  const entries = Object.entries(SYSTEMS_BY_ID) as [
    SystemId,
    (typeof SYSTEMS_BY_ID)[SystemId],
  ][];

  const results = await Promise.all(
    entries.map(async ([system, client]) => {
      try {
        const subs = await client.listWebhookSubscriptions();
        return {
          system,
          subscriptions: subs.map((s) => ({ ...s, system })),
          error: null as string | null,
        };
      } catch {
        return { system, subscriptions: [], error: system };
      }
    }),
  );

  return NextResponse.json({
    subscriptions: results.flatMap((r) => r.subscriptions),
    errors: results.filter((r) => r.error).map((r) => r.error),
  });
}

/**
 * POST /api/webhooks  { system, event_type, target_url }
 * Register a webhook target on the system that owns the event.
 */
export async function POST(request: NextRequest) {
  let body: { system?: string; event_type?: string; target_url?: string };
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

  try {
    const created = await SYSTEMS_BY_ID[system].createWebhookSubscription({
      event_type,
      target_url,
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
