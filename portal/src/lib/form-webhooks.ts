/**
 * Registry of webhook URLs for portal form submissions.
 *
 * Each form hook (see `lib/form-hooks`) can be pointed at a single webhook URL
 * — typically an OpenFn workflow's Webhook trigger. The mapping is stored in a
 * JSON file next to the portal process so it survives dev-server reloads,
 * mirroring the population run log. Best-effort: write failures are swallowed
 * so a registry hiccup never breaks an actual submission.
 *
 * `resolveFormWebhook` is the migration bridge: a URL registered here always
 * wins, but if none is set it falls back to the form's legacy environment
 * variable, so deployments that configured forms via env vars keep working
 * until staff register a URL in the staff area.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
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

const STORE_FILE = path.join(process.cwd(), ".form-webhooks.json");

async function readStore(): Promise<Record<string, FormWebhookRecord>> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(
  store: Record<string, FormWebhookRecord>,
): Promise<void> {
  try {
    await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch {
    // ignore persistence errors — the submission itself must not fail
  }
}

/** All registry entries currently saved (env-var fallbacks are not included). */
export async function listFormWebhooks(): Promise<FormWebhookRecord[]> {
  const store = await readStore();
  return Object.values(store);
}

/** Save (or overwrite) the webhook URL for a form hook. */
export async function setFormWebhook(
  key: string,
  targetUrl: string,
): Promise<FormWebhookRecord> {
  const record: FormWebhookRecord = {
    key,
    target_url: targetUrl,
    updated_at: new Date().toISOString(),
  };
  const store = await readStore();
  store[key] = record;
  await writeStore(store);
  return record;
}

/** Remove the registered URL for a form hook (env-var fallback still applies). */
export async function deleteFormWebhook(key: string): Promise<void> {
  const store = await readStore();
  if (key in store) {
    delete store[key];
    await writeStore(store);
  }
}

/**
 * Resolve the webhook URL for a form hook: a registered URL wins; otherwise
 * fall back to the form's legacy env var. Returns null when neither is set.
 */
export async function resolveFormWebhook(
  key: string,
): Promise<ResolvedFormWebhook | null> {
  const store = await readStore();
  const registered = store[key]?.target_url;
  if (registered) return { url: registered, source: "registry" };

  const envVar = getFormHook(key)?.legacyEnvVar;
  const fromEnv = envVar ? process.env[envVar] : undefined;
  if (fromEnv) return { url: fromEnv, source: "env" };

  return null;
}
