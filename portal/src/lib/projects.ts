/**
 * Projects — named sets of webhook registrations.
 *
 * Each project stands for one OpenFn project (or any other place workflows
 * live). Cloning an OpenFn project gives every workflow in the clone a fresh
 * Webhook trigger URL, so running the same simulation against several clones
 * means keeping several complete sets of URLs. A project is that set: register a
 * project here, fill in its form-submission URLs (see `lib/form-webhooks`) and
 * its system-event subscriptions, then pick the project when starting a
 * simulation to decide which OpenFn instance receives the run.
 *
 * One project is always flagged default. Live citizen-facing form submissions go
 * to it (they have no project to choose), and the staff area preselects it.
 */

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DEFAULT_PROJECT_ID, getDb } from "./db";
import { formWebhooks, projects } from "./db/schema";

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  /** True on exactly one project: the one live form submissions are sent to. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  /** How many form-submission webhooks are registered for this project. */
  webhookCount: number;
}

/** Raised for a rejected project operation (bad name, last project, …). */
export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

type ProjectRow = typeof projects.$inferSelect;

function rowToRecord(row: ProjectRow, webhookCount: number): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    webhookCount,
  };
}

/** Registered form-webhook count per project id. */
function webhookCounts(): Map<string, number> {
  const rows = getDb()
    .select({
      project_id: formWebhooks.project_id,
      count: sql<number>`count(*)`,
    })
    .from(formWebhooks)
    .groupBy(formWebhooks.project_id)
    .all();
  return new Map(rows.map((r) => [r.project_id, Number(r.count)]));
}

/** The subset of the drizzle handle these helpers need (db or a transaction). */
type DbLike = Pick<ReturnType<typeof getDb>, "select">;

/**
 * Validate and normalise a project name. Names are how staff tell projects apart
 * in a dropdown, so a blank or duplicate name is rejected rather than saved.
 * `exceptId` skips one project's own row, so renaming to the same name is a
 * no-op instead of a conflict.
 */
function normaliseName(db: DbLike, input: unknown, exceptId?: string): string {
  const name = typeof input === "string" ? input.trim() : "";
  if (!name) throw new ProjectError("Project name is required");
  if (name.length > 120) {
    throw new ProjectError("Project name must be 120 characters or fewer");
  }

  const clash = db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        sql`lower(${projects.name}) = ${name.toLowerCase()}`,
        exceptId ? ne(projects.id, exceptId) : undefined,
      ),
    )
    .get();
  if (clash) throw new ProjectError(`A project named "${name}" already exists`);

  return name;
}

function normaliseDescription(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  const description = String(input).trim();
  return description === "" ? null : description;
}

/** Every project, default first then alphabetically by name. */
export async function listProjects(): Promise<ProjectRecord[]> {
  const counts = webhookCounts();
  const rows = getDb().select().from(projects).orderBy(asc(projects.name)).all();
  return rows
    .map((row) => rowToRecord(row, counts.get(row.id) ?? 0))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
  if (!row) return null;
  return rowToRecord(row, webhookCounts().get(row.id) ?? 0);
}

/**
 * The project live portal form submissions use, and the staff area's initial
 * selection. Falls back to the bootstrap default project and then to any project
 * at all, so a database whose default flag was lost still resolves to something.
 */
export async function getDefaultProject(): Promise<ProjectRecord | null> {
  const db = getDb();
  const row =
    db.select().from(projects).where(eq(projects.is_default, 1)).get() ??
    db.select().from(projects).where(eq(projects.id, DEFAULT_PROJECT_ID)).get() ??
    db.select().from(projects).orderBy(asc(projects.created_at)).get();
  if (!row) return null;
  return rowToRecord(row, webhookCounts().get(row.id) ?? 0);
}

/** Id of the default project — the fallback for anything without an explicit one. */
export async function defaultProjectId(): Promise<string> {
  return (await getDefaultProject())?.id ?? DEFAULT_PROJECT_ID;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  /**
   * Project to copy form-webhook registrations from. Duplicating a project is
   * the fast path for a cloned OpenFn project: start from the original's URLs
   * and edit the ones the clone changed.
   */
  duplicateOf?: string;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectRecord> {
  const db = getDb();

  return db.transaction((tx) => {
    const source = input.duplicateOf
      ? tx.select().from(projects).where(eq(projects.id, input.duplicateOf)).get()
      : null;
    if (input.duplicateOf && !source) {
      throw new ProjectError("The project to duplicate no longer exists");
    }

    const name = normaliseName(tx, input.name);
    const now = new Date().toISOString();
    const id = randomUUID();

    tx.insert(projects)
      .values({
        id,
        name,
        // Not inherited when duplicating: the source's description describes the
        // source, and a copy that repeats it would be claiming to be the original.
        description: normaliseDescription(input.description),
        // A new project never steals live traffic; staff make it the default
        // explicitly once its URLs are filled in.
        is_default: 0,
        created_at: now,
        updated_at: now,
      })
      .run();

    let copied = 0;
    if (source) {
      const rows = tx
        .select()
        .from(formWebhooks)
        .where(eq(formWebhooks.project_id, source.id))
        .all();
      for (const row of rows) {
        tx.insert(formWebhooks)
          .values({
            project_id: id,
            key: row.key,
            target_url: row.target_url,
            updated_at: now,
          })
          .run();
      }
      copied = rows.length;
    }

    const row = tx.select().from(projects).where(eq(projects.id, id)).get()!;
    return rowToRecord(row, copied);
  });
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  /** Set true to make this the project live form submissions use. */
  isDefault?: boolean;
}

/** Rename a project, edit its description, and/or make it the default. */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectRecord | null> {
  const db = getDb();

  return db.transaction((tx) => {
    const existing = tx.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) return null;

    const now = new Date().toISOString();
    const patch: Partial<typeof projects.$inferInsert> = { updated_at: now };

    if (input.name !== undefined) patch.name = normaliseName(tx, input.name, id);
    if (input.description !== undefined) {
      patch.description = normaliseDescription(input.description);
    }

    if (input.isDefault === true) {
      // Exactly one default: clear the flag on whoever holds it first.
      tx.update(projects)
        .set({ is_default: 0, updated_at: now })
        .where(eq(projects.is_default, 1))
        .run();
      patch.is_default = 1;
    } else if (input.isDefault === false && existing.is_default === 1) {
      throw new ProjectError(
        "Choose another project as the default instead of clearing this one",
      );
    }

    tx.update(projects).set(patch).where(eq(projects.id, id)).run();

    const row = tx.select().from(projects).where(eq(projects.id, id)).get()!;
    const count =
      tx
        .select({ count: sql<number>`count(*)` })
        .from(formWebhooks)
        .where(eq(formWebhooks.project_id, id))
        .get()?.count ?? 0;
    return rowToRecord(row, Number(count));
  });
}

export interface DeleteProjectResult {
  deleted: true;
  /** Set when deleting the default project promoted another one. */
  newDefaultId?: string;
}

/**
 * Delete a project and the form-webhook registrations that belong to it. The
 * last remaining project can't be deleted — live form submissions need
 * somewhere to resolve — and deleting the default promotes the oldest remaining
 * project so exactly one default survives. Returns null when the project is
 * already gone.
 */
export async function deleteProject(
  id: string,
): Promise<DeleteProjectResult | null> {
  const db = getDb();

  return db.transaction((tx) => {
    const existing = tx.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) return null;

    const total =
      tx.select({ count: sql<number>`count(*)` }).from(projects).get()?.count ?? 0;
    if (Number(total) <= 1) {
      throw new ProjectError(
        "The last project can't be deleted — create another project first",
      );
    }

    // Explicit, so registrations go with the project whether or not the
    // connection has foreign-key enforcement on.
    tx.delete(formWebhooks).where(eq(formWebhooks.project_id, id)).run();
    tx.delete(projects).where(eq(projects.id, id)).run();

    const result: DeleteProjectResult = { deleted: true };
    if (existing.is_default === 1) {
      const heir = tx
        .select()
        .from(projects)
        .orderBy(asc(projects.created_at))
        .get();
      if (heir) {
        tx.update(projects)
          .set({ is_default: 1, updated_at: new Date().toISOString() })
          .where(eq(projects.id, heir.id))
          .run();
        result.newDefaultId = heir.id;
      }
    }
    return result;
  });
}
