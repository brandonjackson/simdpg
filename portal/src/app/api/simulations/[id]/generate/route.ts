import { NextResponse } from "next/server";
import {
  generateSimulation,
  SimulationTransitionError,
} from "@/lib/simulations/store";
import { generateStubEvents } from "@/lib/simulations/stub-generator";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    await generateStubEvents(params.id);
    const simulation = await generateSimulation(params.id);

    if (!simulation) {
      return NextResponse.json(
        { error: "Simulation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ simulation });
  } catch (err) {
    const status = err instanceof SimulationTransitionError ? 409 : 400;
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status });
  }
}