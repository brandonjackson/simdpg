import { Router } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { notFound, getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import {
  accounts,
  payments,
  ledgerEntries,
  webhookEvents,
  webhookSubscriptions,
} from "../db/schema.js";

const router = Router();

function count(
  table: typeof accounts | typeof payments | typeof ledgerEntries,
): number {
  return db.select({ c: sql<number>`count(*)` }).from(table).get()?.c ?? 0;
}

// ---------------------------------------------------------------------------
// GET /admin/stats — account, payment, and ledger-entry counts
// ---------------------------------------------------------------------------
router.get("/stats", (_req, res, next) => {
  try {
    res.json({
      system: "payments",
      accounts: count(accounts),
      payments: count(payments),
      ledger_entries: count(ledgerEntries),
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
// POST /admin/reset — wipe all payment data.
//
// Clears payments, ledger entries, and accounts. Unlike Benefits (which keeps
// its reference programmes), Payments holds no reference data, so a reset
// wipes everything; re-seed to recreate the funded treasury account.
// ---------------------------------------------------------------------------
router.post("/reset", (_req, res, next) => {
  try {
    // Delete dependents first to respect foreign keys.
    db.delete(ledgerEntries).run();
    db.delete(payments).run();
    db.delete(accounts).run();
    res.json({ system: "payments", reset: true });
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
});

router.get("/webhook-subscriptions", (req, res, next) => {
  try {
    const { offset, limit, page, per_page } = getPagination(req);
    const total =
      db.select({ c: sql<number>`count(*)` }).from(webhookSubscriptions).get()
        ?.c ?? 0;
    const rows = db
      .select()
      .from(webhookSubscriptions)
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
