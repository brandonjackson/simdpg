/**
 * Registry of webhook URLs for portal form submissions.
 *
 * Each form hook (see `lib/form-hooks`) can be pointed at a single webhook URL
 * — typically an OpenFn workflow's Webhook trigger. The mapping is stored in the
 * portal's SQLite database (the `form_webhooks` table), so registrations survive
 * restarts and redeploys on the same persistent volume as the simulation
 * tables. This replaces the old `.form-webhooks.json` file, which lived on the
 * portal's ephemeral working directory and was wiped on every deploy.
 *
 * `resolveFormWebhook` is the migration bridge: a URL registered here always
 * wins, but if none is set it falls back to the form's legacy environment
 * variable, so deployments that configured forms via env vars keep working
 * until staff register a URL in the staff area.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { formWebhooks } from "./db/schema";
import { getFormHook } from "./form-hooks";

export interface FormWebhookRecord {
  key: string;
  target_url: string;
  updated_at: string;
}

export interface ResolvedFormWebhook {
  url: string;
  /** Where the URL came from: the saved registry or a legacy env var. */
  source: "registry" | "env";
}

/** All registry entries currently saved (env-var fallbacks are not included). */
export async function listFormWebhooks(): Promise<FormWebhookRecord[]> {
  return getDb().select().from(formWebhooks).all();
}

/**
 * Save (or overwrite) the webhook URL for a form hook. Write failures (e.g. a
 * read-only volume) propagate to the caller so the API can report them rather
 * than pretend the save succeeded.
 */
export async function setFormWebhook(
  key: string,
  targetUrl: string,
): Promise<FormWebhookRecord> {
  const record: FormWebhookRecord = {
    key,
    target_url: targetUrl,
    updated_at: new Date().toISOString(),
  };
  getDb()
    .insert(formWebhooks)
    .values(record)
    .onConflictDoUpdate({
      target: formWebhooks.key,
      set: { target_url: record.target_url, updated_at: record.updated_at },
    })
    .run();
  return record;
}

/** Remove the registered URL for a form hook (env-var fallback still applies). */
export async function deleteFormWebhook(key: string): Promise<void> {
  getDb().delete(formWebhooks).where(eq(formWebhooks.key, key)).run();
}

/**
 * Resolve the webhook URL for a form hook: a registered URL wins; otherwise
 * fall back to the form's legacy env var. Returns null when neither is set.
 */
export async function resolveFormWebhook(
  key: string,
): Promise<ResolvedFormWebhook | null> {
  const row = getDb()
    .select()
    .from(formWebhooks)
    .where(eq(formWebhooks.key, key))
    .get();
  if (row?.target_url) return { url: row.target_url, source: "registry" };

  const envVar = getFormHook(key)?.legacyEnvVar;
  const fromEnv = envVar ? process.env[envVar] : undefined;
  if (fromEnv) return { url: fromEnv, source: "env" };

  return null;
}
