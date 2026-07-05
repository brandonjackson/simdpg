import { NextResponse } from "next/server";
import {
  getSimulation,
  generateSimulation,
  SimulationTransitionError,
} from "@/lib/simulations/store";
import { generateEvents } from "@/lib/simulations/generate-events";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const simulation = await getSimulation(params.id);
    if (!simulation) {
      return NextResponse.json(
        { error: "Simulation not found" },
        { status: 404 },
      );
    }

    await generateEvents(params.id, simulation.parameters);
    const updated = await generateSimulation(params.id);

    return NextResponse.json({ simulation: updated });
  } catch (err) {
    const status = err instanceof SimulationTransitionError ? 409 : 400;
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status });
  }
}