import { NextResponse } from "next/server";
import {
  getSimulation,
  generateSimulation,
  SimulationTransitionError,
} from "@/lib/simulations/store";
import { generateEvents } from "@/lib/simulations/generate-events";
import { summarizeEvents } from "@/lib/simulations/event-summary";

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

    // Guard before generating: re-running generate on an already-generated (or
    // otherwise non-created) simulation would overwrite its persisted event
    // script with fresh random events before generateSimulation rejects the
    // transition. Reject first so a 409 never mutates state.
    if (simulation.status !== "created") {
      throw new SimulationTransitionError(
        "Only created simulations can be generated",
      );
    }

    const events = await generateEvents(params.id, simulation.parameters);
    const updated = await generateSimulation(params.id);

    return NextResponse.json({
      simulation: updated,
      eventSummary: summarizeEvents(events),
    });
  } catch (err) {
    const status = err instanceof SimulationTransitionError ? 409 : 400;
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status });
  }
}
