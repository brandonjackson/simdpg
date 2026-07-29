import { NextRequest, NextResponse } from "next/server";
import {
  deleteProject,
  getProject,
  ProjectError,
  updateProject,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

/** GET /api/projects/<id> */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const project = await getProject(params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

/**
 * PATCH /api/projects/<id>  { name?, description?, is_default? }
 * Rename a project, edit its description, or make it the project live portal
 * form submissions use. Omitted fields are left alone.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let body: { name?: string; description?: string; is_default?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const project = await updateProject(params.id, {
      name: body.name,
      description: body.description,
      isDefault: body.is_default,
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof ProjectError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not update the project",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/<id>
 * Removes the project and the form-webhook registrations that belong to it.
 * Rejected for the last remaining project; deleting the default promotes
 * another project and reports it as `new_default_id`.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const result = await deleteProject(params.id);
    if (!result) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: params.id,
      deleted: true,
      new_default_id: result.newDefaultId ?? null,
    });
  } catch (err) {
    if (err instanceof ProjectError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not delete the project",
      },
      { status: 500 },
    );
  }
}
