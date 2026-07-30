import { NextResponse } from "next/server";
import {
  clearSystemBehavior,
  enabledSystems,
  readSystemBehavior,
} from "@/lib/system-behavior";

export const dynamic = "force-dynamic";

/** What every system is currently doing — latency, failures, throttling. */
export async function GET() {
  const systems = await readSystemBehavior();
  return NextResponse.json({
    systems,
    enabled: enabledSystems(systems).length > 0,
  });
}

/**
 * Return every system to its default behaviour. The worker already does this
 * when a run ends; this is the manual escape hatch for the case where it
 * couldn't — a killed worker, or a config applied by hand.
 */
export async function DELETE() {
  const systems = await clearSystemBehavior();
  return NextResponse.json({
    systems,
    enabled: enabledSystems(systems).length > 0,
    failed: systems.filter((system) => !system.ok).map((system) => system.label),
  });
}
