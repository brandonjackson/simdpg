import { NextRequest, NextResponse } from "next/server";
import {
  copySimulation,
  generateSimulation,
  getSimulation,
  startSimulation,
  type SimulationRecord,
} from "@/lib/simulations/store";
import { generateEvents } from "@/lib/simulations/generate-events";
import { resolveCopyProject } from "@/lib/simulations/copy";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

interface CopyBody {
  /** Project the copy delivers to. Defaults to the source's project. */
  projectId?: unknown;
  /**
   * Generate the copy's events and start it immediately — what the Re-run button
   * sends for a simulation that has already finished. Left off, the copy is
   * created and nothing else happens.
   */
  start?: unknown;
}

/**
 * Copy a simulation's settings into a new simulation, optionally running it.
 *
 * Both portal actions come through here: **Copy** for a simulation that has not
 * run yet (`start` omitted) and **Re-run** for one that has (`start: true`). The
 * copy always begins at `created`, so its events are generated fresh — a re-run
 * repeats the configuration, not the previous run's event script.
 *
 * Replies 201 with the copy. When a re-run's generate-or-start step fails, the
 * copy is still saved and the reply carries `started: false` and an `error`
 * describing what went wrong, so the caller can point at the copy and let the
 * user generate it by hand rather than lose the settings.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const source = await getSimulation(params.id);
  if (!source) {
    return NextResponse.json({ error: "Simulation not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { projectId: requestedProjectId, start } = (body ?? {}) as CopyBody;

  // Where the copy's events go — the source's project unless the caller names
  // another. Resolved before anything is created, so a copy never exists without
  // somewhere to deliver to.
  const target = await resolveCopyProject(
    source,
    typeof requestedProjectId === "string" ? requestedProjectId : undefined,
  );
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: 400 });
  }

  let copy: SimulationRecord | null;
  try {
    copy = await copySimulation(params.id, target.project);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not copy simulation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (!copy) {
    // The source was deleted between the read above and the copy.
    return NextResponse.json({ error: "Simulation not found" }, { status: 404 });
  }

  if (start !== true) {
    return NextResponse.json({ simulation: copy, started: false }, { status: 201 });
  }

  try {
    // The same three steps the detail page's Generate and Start buttons drive,
    // in order: generation reads the live systems, so it is the step most likely
    // to fail here (systems down, no population).
    await generateEvents(copy.id, copy.parameters);
    await generateSimulation(copy.id);
    const started = await startSimulation(copy.id);
    return NextResponse.json(
      { simulation: started ?? copy, started: true },
      { status: 201 },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Re-read, because how far it got matters: generation may have succeeded and
    // only the start have failed, leaving the copy `generated`. A copy still at
    // `created` means generation is what broke, and its usual cause — the systems
    // it draws the population from being unreachable — is worth naming, since the
    // underlying error is often no more than "fetch failed".
    const current = await getSimulation(copy.id);
    const error =
      current?.status === "created"
        ? `Could not generate the copy's events: ${reason}. Events are drawn from the live systems, so check they are running.`
        : `Could not start the copy: ${reason}`;
    return NextResponse.json(
      { simulation: current ?? copy, started: false, error },
      { status: 201 },
    );
  }
}
