import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  notFound,
  getPagination,
  listResponse,
} from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";

const router = Router();

const sendNotificationSchema = z.object({
  citizen_id: z.string().min(1),
  channel: z.enum(["email", "sms"]),
  destination: z.string().min(1),
  subject: z.string().nullable().optional(),
  body: z.string().min(1),
  source_system: z.string().min(1),
  source_event: z.string().nullable().optional(),
});

const sendBulkSchema = z.object({
  notifications: z.array(sendNotificationSchema).min(1).max(100),
});

router.post("/", async (req, res, next) => {
  try {
    const body = sendNotificationSchema.parse(req.body);

    const id = uuidv4();
    const now = new Date().toISOString();

    db.insert(notifications)
      .values({
        id,
        citizen_id: body.citizen_id,
        channel: body.channel,
        destination: body.destination,
        subject: body.subject ?? null,
        body: body.body,
        source_system: body.source_system,
        source_event: body.source_event ?? null,
        status: "sent",
        attempts: 1,
        sent_at: now,
        created_at: now,
        updated_at: now,
      })
      .run();

    const created = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .get();

    emitWebhook("notification.sent", created as Record<string, unknown>);

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.post("/bulk", async (req, res, next) => {
  try {
    const body = sendBulkSchema.parse(req.body);
    const now = new Date().toISOString();
    const results = [];

    for (const n of body.notifications) {
      const id = uuidv4();
      db.insert(notifications)
        .values({
          id,
          citizen_id: n.citizen_id,
          channel: n.channel,
          destination: n.destination,
          subject: n.subject ?? null,
          body: n.body,
          source_system: n.source_system,
          source_event: n.source_event ?? null,
          status: "sent",
          attempts: 1,
          sent_at: now,
          created_at: now,
          updated_at: now,
        })
        .run();

      const created = db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id))
        .get();

      results.push(created);
    }

    emitWebhook("notification.bulk_sent", { count: results.length });

    res.status(201).json(results);
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const citizenId = req.query.citizen_id as string | undefined;
    const status = req.query.status as string | undefined;
    const sourceService = req.query.source_system as string | undefined;

    const { offset, limit, page, per_page } = getPagination(req);

    const conditions = [];
    if (citizenId) {
      conditions.push(eq(notifications.citizen_id, citizenId));
    }
    if (status) {
      conditions.push(
        eq(
          notifications.status,
          status as "pending" | "sent" | "delivered" | "failed",
        ),
      );
    }
    if (sourceService) {
      conditions.push(eq(notifications.source_system, sourceService));
    }

    const where =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]!
          : and(...conditions);

    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(notifications)
        .where(where)
        .get()?.c ?? 0;

    const rows = db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.created_at))
      .limit(limit)
      .offset(offset)
      .all();

    res.json(listResponse(rows, { page, per_page }, total));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const row = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .get();

    if (!row) {
      throw notFound("Notification not found");
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
});

export default router;
