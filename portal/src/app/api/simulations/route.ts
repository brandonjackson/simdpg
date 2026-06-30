import { NextRequest, NextResponse } from "next/server";
import {
  createSimulation,
  listSimulations,
  parseSimulationParameters,
} from "@/lib/simulations/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const simulations = await listSimulations();
  return NextResponse.json({ simulations });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const parameters = parseSimulationParameters(
      (body as { parameters?: unknown })?.parameters ?? body,
    );
    const simulation = await createSimulation(parameters);
    return NextResponse.json({ simulation }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid simulation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}