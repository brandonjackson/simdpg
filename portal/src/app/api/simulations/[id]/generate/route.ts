import { NextResponse } from "next/server";
import {
  canGenerate,
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

    // Guard before generating: re-running generate on an already-generated
    // simulation would overwrite its persisted event script with fresh random
    // events before generateSimulation rejects the transition. Reject first so
    // a 409 never mutates state. A record whose script is missing is the one
    // exception — there, generating again is the recovery, not a loss.
    if (!(await canGenerate(simulation))) {
      throw new SimulationTransitionError(
        "Only created simulations can be generated",
      );
    }

    await generateEvents(params.id, simulation.parameters);
    const updated = await generateSimulation(params.id, simulation.status);

    return NextResponse.json({ simulation: updated });
  } catch (err) {
    const status = err instanceof SimulationTransitionError ? 409 : 400;
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status });
  }
}
