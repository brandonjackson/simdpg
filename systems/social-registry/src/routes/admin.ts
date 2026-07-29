import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { eq, sql, desc } from "drizzle-orm";
import { notFound, getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import {
  assessments,
  vulnerabilityIndicators,
  webhookEvents,
  webhookSubscriptions,
} from "../db/schema.js";

const router = Router();

function count(
  table: typeof assessments | typeof vulnerabilityIndicators,
): number {
  return db.select({ c: sql<number>`count(*)` }).from(table).get()?.c ?? 0;
}

// ---------------------------------------------------------------------------
// GET /admin/stats — assessment and indicator counts for the dashboard
// ---------------------------------------------------------------------------
router.get("/stats", (_req, res, next) => {
  try {
    res.json({
      system: "social-registry",
      assessments: count(assessments),
      vulnerability_indicators: count(vulnerabilityIndicators),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/webhooks — paginated log of emitted webhook events (debugging)
// ---------------------------------------------------------------------------
router.get("/webhooks", (req, res, next) => {
  try {
    const { offset, limit, page, per_page } = getPagination(req);

    const total =
      db.select({ c: sql<number>`count(*)` }).from(webhookEvents).get()?.c ?? 0;

    const rows = db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.time))
      .limit(limit)
      .offset(offset)
      .all();

    const events = rows.map((row) => ({
      ...row,
      data: JSON.parse(row.data) as unknown,
    }));

    res.json(listResponse(events, { page, per_page }, total));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/reset — wipe all assessments and indicators.
// ---------------------------------------------------------------------------
router.post("/reset", (_req, res, next) => {
  try {
    // Delete dependents first to respect foreign keys.
    db.delete(vulnerabilityIndicators).run();
    db.delete(assessments).run();
    res.json({ system: "social-registry", reset: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Webhook subscriptions — per-event delivery targets for OpenFn integrations
// ---------------------------------------------------------------------------
const createSubscriptionSchema = z.object({
  event_type: z.string().min(1),
  target_url: z.string().url(),
  /** Portal project this URL belongs to; omitted by pre-projects callers. */
  project_id: z.string().min(1).optional(),
});

// `?project_id=` narrows the list to one portal project's registrations; without
// it every registration is returned, whatever project it belongs to.
router.get("/webhook-subscriptions", (req, res, next) => {
  try {
    const { offset, limit, page, per_page } = getPagination(req);
    const projectId =
      typeof req.query.project_id === "string" ? req.query.project_id : null;
    const scope = projectId
      ? eq(webhookSubscriptions.project_id, projectId)
      : undefined;
    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(webhookSubscriptions)
        .where(scope)
        .get()?.c ?? 0;
    const rows = db
      .select()
      .from(webhookSubscriptions)
      .where(scope)
      .orderBy(desc(webhookSubscriptions.created_at))
      .limit(limit)
      .offset(offset)
      .all();
    res.json(listResponse(rows, { page, per_page }, total));
  } catch (err) {
    next(err);
  }
});

router.post("/webhook-subscriptions", (req, res, next) => {
  try {
    const body = createSubscriptionSchema.parse(req.body);
    const row = {
      id: uuidv4(),
      event_type: body.event_type,
      target_url: body.target_url,
      project_id: body.project_id ?? null,
      created_at: new Date().toISOString(),
    };
    db.insert(webhookSubscriptions).values(row).run();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.delete("/webhook-subscriptions/:id", (req, res, next) => {
  try {
    const existing = db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.id, req.params.id))
      .get();
    if (!existing) throw notFound("Webhook subscription not found");
    db.delete(webhookSubscriptions)
      .where(eq(webhookSubscriptions.id, req.params.id))
      .run();
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
