import { getDefaultProject, getProject, type ProjectRecord } from "@/lib/projects";
import type { SimulationRecord } from "./store";

export type CopyTarget =
  | { project: ProjectRecord }
  | { error: string };

/**
 * Which project a copy of `source` should deliver to.
 *
 * A copy follows its source by default, so a re-run's events land in the same
 * OpenFn project the original's did. Two cases need deciding:
 *
 * - **The source names a project that has since been deleted.** Rejected. There
 *   is nowhere to send the events, and quietly falling back to the default
 *   project would post a run's results to an OpenFn instance nobody chose.
 * - **The source names no project at all**, because it predates projects. Falls
 *   back to the default project — the same thing a wizard-created simulation
 *   with no explicit project does.
 *
 * `requestedProjectId` overrides the source's choice; an unknown one is rejected
 * rather than defaulted, matching how creating a simulation treats it.
 */
export async function resolveCopyProject(
  source: SimulationRecord,
  requestedProjectId?: string,
): Promise<CopyTarget> {
  const explicitId = requestedProjectId?.trim() || null;

  if (explicitId) {
    const project = await getProject(explicitId);
    return project ? { project } : { error: "Unknown project" };
  }

  const sourceId = source.parameters.projectId;
  if (!sourceId) {
    const project = await getDefaultProject();
    return project
      ? { project }
      : { error: "No project is registered to send this simulation to" };
  }

  const project = await getProject(sourceId);
  if (project) return { project };

  const label = source.parameters.projectName || sourceId;
  return {
    error:
      `The project this simulation was created for (${label}) no longer exists, ` +
      "so there is nowhere to send the copy. Start a new simulation and choose a " +
      "project for it.",
  };
}
