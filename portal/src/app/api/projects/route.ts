import { NextRequest, NextResponse } from "next/server";
import {
  createProject,
  listProjects,
  ProjectError,
  type ProjectRecord,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects
 * Every registered project, default first. `default_project_id` saves callers
 * from scanning for the flag when they just need the initial selection.
 */
export async function GET() {
  const projects = await listProjects();
  const defaultProject = projects.find((p: ProjectRecord) => p.isDefault);
  return NextResponse.json({
    projects,
    default_project_id: defaultProject?.id ?? projects[0]?.id ?? null,
  });
}

/**
 * POST /api/projects  { name, description?, duplicate_of? }
 * Register a project. With `duplicate_of` the new project starts with a copy of
 * that project's form-webhook registrations — the fast path for a cloned OpenFn
 * project, where most URLs are then edited rather than typed from scratch.
 */
export async function POST(request: NextRequest) {
  let body: { name?: string; description?: string; duplicate_of?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const project = await createProject({
      name: body.name ?? "",
      description: body.description,
      duplicateOf: body.duplicate_of,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not create the project",
      },
      { status: 500 },
    );
  }
}
