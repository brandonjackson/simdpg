import { NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulations/store";
import { readEvents } from "@/lib/simulations/events";
import { readGenerationSummary } from "@/lib/simulations/generation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const simulation = await getSimulation(params.id);

  if (!simulation) {
    return NextResponse.json(
      { error: "Simulation not found" },
      { status: 404 },
    );
  }

  const events = await readEvents(params.id);
  // Sent alongside the events so the detail page can account for a short or
  // empty script. Null for runs generated before summaries existed.
  const generation = await readGenerationSummary(params.id);

  return NextResponse.json({ events, generation });
}
