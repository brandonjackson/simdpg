import { NextRequest, NextResponse } from "next/server";
import {
  createSimulation,
  listSimulations,
  parseSimulationParameters,
} from "@/lib/simulations/store";
import { getDefaultProject, getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const simulations = await listSimulations();
  return NextResponse.json({ simulations });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const raw = ((body as { parameters?: unknown })?.parameters ?? body) as
    | Record<string, unknown>
    | null;

  // Resolve the target project before anything is created: an unknown project is
  // a bad request, not a simulation whose events go nowhere. Its name is stored
  // with the run so the record still reads sensibly if the project is renamed.
  const requestedProjectId =
    typeof raw?.projectId === "string" ? raw.projectId : undefined;
  const project = requestedProjectId
    ? await getProject(requestedProjectId)
    : await getDefaultProject();
  if (!project) {
    return NextResponse.json(
      {
        error: requestedProjectId
          ? "Unknown project"
          : "No project is registered to send this simulation to",
      },
      { status: 400 },
    );
  }

  try {
    const parameters = parseSimulationParameters({
      ...raw,
      projectId: project.id,
      projectName: project.name,
    });
    const simulation = await createSimulation(parameters);
    return NextResponse.json({ simulation }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid simulation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
