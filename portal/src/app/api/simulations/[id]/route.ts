import { NextResponse } from "next/server";
import {
  deleteSimulation,
  getSimulation,
} from "@/lib/simulations/store";
import { getEventSummary } from "@/lib/simulations/event-summary";

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

  // Derived from the persisted events file, so it's null until the simulation
  // has been generated and stays available for the rest of its lifecycle.
  const eventSummary = await getEventSummary(params.id);

  return NextResponse.json({ simulation, eventSummary });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const deleted = await deleteSimulation(params.id);

  if (!deleted) {
    return NextResponse.json(
      { error: "Simulation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}