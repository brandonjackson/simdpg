import { NextResponse } from "next/server";
import {
  SimulationTransitionError,
  stopSimulation,
} from "@/lib/simulations/store";
import { clearSystemBehavior } from "@/lib/system-behavior";
import { isBehaviorOff } from "@simdpg/system-kit/behavior";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const simulation = await stopSimulation(params.id);

    if (!simulation) {
      return NextResponse.json(
        { error: "Simulation not found" },
        { status: 404 },
      );
    }

    // The worker clears the behaviour it applied as it shuts down, but a stop is
    // exactly when that worker might already be gone, so clear it from here too.
    // Both paths are idempotent, and every system also expires the config on its
    // own — see applySystemBehavior's expiresAt.
    const behavior = simulation.parameters.behavior;
    if (behavior && !isBehaviorOff(behavior)) {
      await clearSystemBehavior();
    }

    return NextResponse.json({ simulation });
  } catch (err) {
    const status = err instanceof SimulationTransitionError ? 409 : 400;
    const message = err instanceof Error ? err.message : "Stop failed";
    return NextResponse.json({ error: message }, { status });
  }
}