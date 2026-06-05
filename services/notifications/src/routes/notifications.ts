import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
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
  source_service: z.string().min(1),
  source_event: z.string().nullable().optional(),
});

const sendBulkSchema = z.object({
  notifications: z.array(sendNotificationSchema).min(1).max(100),
});

function asyncHandler(
  fn: (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => Promise<void>,
): import("express").RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
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
        source_service: body.source_service,
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
  }),
);

router.post(
  "/bulk",
  asyncHandler(async (req, res) => {
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
          source_service: n.source_service,
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
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const citizenId = req.query.citizen_id as string | undefined;
    const status = req.query.status as string | undefined;
    const sourceService = req.query.source_service as string | undefined;

    let query = db.select().from(notifications);

    if (citizenId) {
      query = query.where(eq(notifications.citizen_id, citizenId)) as typeof query;
    }
    if (status) {
      query = query.where(eq(notifications.status, status as "pending" | "sent" | "delivered" | "failed")) as typeof query;
    }
    if (sourceService) {
      query = query.where(eq(notifications.source_service, sourceService)) as typeof query;
    }

    const rows = query.orderBy(desc(notifications.created_at)).all();
    res.json(rows);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const row = db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .get();

    if (!row) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(row);
  }),
);

export default router;
