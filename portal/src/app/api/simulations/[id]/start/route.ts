import { NextResponse } from "next/server";
import {
  SimulationTransitionError,
  startSimulation,
} from "@/lib/simulations/store";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const simulation = await startSimulation(params.id);

    if (!simulation) {
      return NextResponse.json(
        { error: "Simulation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ simulation });
  } catch (err) {
    const status = err instanceof SimulationTransitionError ? 409 : 400;
    const message = err instanceof Error ? err.message : "Start failed";
    return NextResponse.json({ error: message }, { status });
  }
}