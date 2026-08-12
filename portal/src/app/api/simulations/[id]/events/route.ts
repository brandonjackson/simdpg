import { NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulations/store";
import { readScript } from "@/lib/simulations/script";

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

  const script = await readScript(params.id);

  // `hasScript` distinguishes the two ways `events` comes back empty: a script
  // that generated no events (which runs, and whose `generation` summary says
  // why it is empty) from no script at all (which cannot run until regenerated).
  return NextResponse.json({
    events: script?.events ?? [],
    generation: script?.generation ?? null,
    hasScript: script !== null,
  });
}
