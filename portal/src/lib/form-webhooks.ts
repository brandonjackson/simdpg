/**
 * Registry of webhook URLs for portal form submissions, scoped by project.
 *
 * Each form hook (see `lib/form-hooks`) can be pointed at a single webhook URL
 * — typically an OpenFn workflow's Webhook trigger — per project (see
 * `lib/projects`). Registering the same form in several projects is how one
 * portal drives several cloned OpenFn projects: a simulation names the project
 * it runs against, and every event it generates resolves that project's URLs.
 *
 * The mapping is stored in the portal's SQLite database (the `form_webhooks`
 * table, keyed by project and form), so registrations survive restarts and
 * redeploys on the same persistent volume as the simulation tables. This
 * replaces the old `.form-webhooks.json` file, which lived on the portal's
 * ephemeral working directory and was wiped on every deploy.
 *
 * `resolveFormWebhook` is the migration bridge: a URL registered for the project
 * always wins, but for the *default* project — the one live citizen-facing
 * submissions use — it falls back to the form's legacy environment variable, so
 * deployments that configured forms via env vars keep working until staff
 * register a URL in the staff area. Other projects have no env-var fallback:
 * their whole point is to name their own endpoints, and silently borrowing the
 * legacy URL would send their traffic to the wrong OpenFn instance.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { formWebhooks } from "./db/schema";
import { getFormHook } from "./form-hooks";
import { defaultProjectId } from "./projects";

export interface FormWebhookRecord {
  project_id: string;
  key: string;
  target_url: string;
  updated_at: string;
}

export interface ResolvedFormWebhook {
  url: string;
  /** Where the URL came from: the saved registry or a legacy env var. */
  source: "registry" | "env";
}

/**
 * Registry entries saved for a project (env-var fallbacks are not included).
 * Defaults to the default project when no project is named.
 */
export async function listFormWebhooks(
  projectId?: string,
): Promise<FormWebhookRecord[]> {
  const project = projectId ?? (await defaultProjectId());
  return getDb()
    .select()
    .from(formWebhooks)
    .where(eq(formWebhooks.project_id, project))
    .all();
}

/**
 * Save (or overwrite) the webhook URL for a form hook within a project. Write
 * failures (e.g. a read-only volume) propagate to the caller so the API can
 * report them rather than pretend the save succeeded.
 */
export async function setFormWebhook(
  projectId: string,
  key: string,
  targetUrl: string,
): Promise<FormWebhookRecord> {
  const record: FormWebhookRecord = {
    project_id: projectId,
    key,
    target_url: targetUrl,
    updated_at: new Date().toISOString(),
  };
  getDb()
    .insert(formWebhooks)
    .values(record)
    .onConflictDoUpdate({
      target: [formWebhooks.project_id, formWebhooks.key],
      set: { target_url: record.target_url, updated_at: record.updated_at },
    })
    .run();
  return record;
}

/**
 * Remove a project's registered URL for a form hook (for the default project, an
 * env-var fallback still applies).
 */
export async function deleteFormWebhook(
  projectId: string,
  key: string,
): Promise<void> {
  getDb()
    .delete(formWebhooks)
    .where(
      and(eq(formWebhooks.project_id, projectId), eq(formWebhooks.key, key)),
    )
    .run();
}

/**
 * Resolve the webhook URL for a form hook in a project: a registered URL wins;
 * for the default project only, fall back to the form's legacy env var. Returns
 * null when neither is set. `projectId` defaults to the default project, which
 * is what live citizen-facing submissions use.
 */
export async function resolveFormWebhook(
  key: string,
  projectId?: string,
): Promise<ResolvedFormWebhook | null> {
  const fallbackProject = await defaultProjectId();
  const project = projectId ?? fallbackProject;

  const row = getDb()
    .select()
    .from(formWebhooks)
    .where(
      and(eq(formWebhooks.project_id, project), eq(formWebhooks.key, key)),
    )
    .get();
  if (row?.target_url) return { url: row.target_url, source: "registry" };

  if (project !== fallbackProject) return null;

  const envVar = getFormHook(key)?.legacyEnvVar;
  const fromEnv = envVar ? process.env[envVar] : undefined;
  if (fromEnv) return { url: fromEnv, source: "env" };

  return null;
}
