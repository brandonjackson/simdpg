import { NextResponse } from "next/server";
import {
  deleteSimulation,
  getSimulation,
} from "@/lib/simulations/store";

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

  return NextResponse.json({ simulation });
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