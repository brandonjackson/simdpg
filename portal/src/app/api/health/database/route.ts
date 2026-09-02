import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db-health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health/database — the state of every database behind the portal.
 *
 * Drives the alert banner in the site layout, and is worth curling on its own
 * when a deploy looks wrong: it names the broken service, the file it is using
 * and the command that fixes it. Answers 503 when something is broken so an
 * uptime check can see it too; the body is the same either way.
 */
export async function GET() {
  const health = await checkDatabaseHealth();

  return NextResponse.json(health, {
    status: health.status === "error" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
