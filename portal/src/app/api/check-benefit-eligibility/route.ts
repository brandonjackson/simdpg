import { NextRequest, NextResponse } from "next/server";
import { SERVICES } from "@/lib/service-registry";

// Allowlist: env var names declared in the service registry for this service.
const service = SERVICES.find((s) => s.id === "benefits-eligibility")!;
const KNOWN_ENV_VARS = new Set(
  service.openfnWorkflows.map((w) => w.envVar).filter(Boolean),
);

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const envVar = searchParams.get("workflow");

  if (!envVar || !KNOWN_ENV_VARS.has(envVar)) {
    return NextResponse.json({ error: "Unknown workflow" }, { status: 404 });
  }

  const url = process.env[envVar];
  if (!url) {
    return NextResponse.json(
      { error: `Workflow not configured. Set the ${envVar} environment variable.` },
      { status: 503 },
    );
  }

  const body = await request.text();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "OpenFn unreachable" }, { status: 502 });
  }
}
