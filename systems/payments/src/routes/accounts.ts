import { Router } from "express";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  notFound,
  conflict,
  getPagination,
  listResponse,
} from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { accounts, ledgerEntries } from "../db/schema.js";
import { emitWebhook } from "../webhooks.js";
import { asyncHandler } from "./helpers.js";

const router = Router();

const openAccountSchema = z.object({
  owner_type: z.enum(["treasury", "citizen"]),
  /** Required for citizen accounts; defaults to "treasury" for the treasury. */
  owner_id: z.string().min(1).optional(),
  initial_balance: z.number().nonnegative().default(0),
  currency: z.string().min(1).default("SIM"),
});

/**
 * POST /accounts — open an account (treasury or for a citizen).
 *
 * Idempotent per owner: opening an account for an owner that already has one
 * returns the existing account rather than creating a duplicate.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = openAccountSchema.parse(req.body);

    const owner_id =
      body.owner_type === "treasury" ? (body.owner_id ?? "treasury") : body.owner_id;

    if (!owner_id) {
      throw conflict("owner_id is required when opening a citizen account");
    }

    const existing = db
      .select()
      .from(accounts)
      .where(eq(accounts.owner_id, owner_id))
      .get();

    if (existing) {
      // Idempotent open — surface the already-open account unchanged.
      res.status(200).json(existing);
      return;
    }

    const now = new Date().toISOString();
    const id = uuidv4();

    db.insert(accounts)
      .values({
        id,
        owner_type: body.owner_type,
        owner_id,
        balance: body.initial_balance,
        currency: body.currency,
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .run();

    const account = db.select().from(accounts).where(eq(accounts.id, id)).get();

    emitWebhook("account.opened", account as Record<string, unknown>);

    res.status(201).json(account);
  }),
);

/**
 * GET /accounts — list accounts, optionally filtered by owner_type or owner_id.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const ownerType = req.query.owner_type as string | undefined;
    const ownerId = req.query.owner_id as string | undefined;
    const { offset, limit, page, per_page } = getPagination(req);

    const filters: SQL[] = [];
    if (ownerType) filters.push(eq(accounts.owner_type, ownerType as "treasury" | "citizen"));
    if (ownerId) filters.push(eq(accounts.owner_id, ownerId));
    const where = filters.length ? and(...filters) : undefined;

    const total =
      db.select({ c: sql<number>`count(*)` }).from(accounts).where(where).get()
        ?.c ?? 0;

    const rows = db
      .select()
      .from(accounts)
      .where(where)
      .limit(limit)
      .offset(offset)
      .all();

    res.json(listResponse(rows, { page, per_page }, total));
  }),
);

/**
 * GET /accounts/:id — get a single account with its current balance.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!account) throw notFound("Account not found");
    res.json(account);
  }),
);

/**
 * GET /accounts/:id/ledger — list ledger entries for an account (newest first).
 */
router.get(
  "/:id/ledger",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { offset, limit, page, per_page } = getPagination(req);

    const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!account) throw notFound("Account not found");

    const where = eq(ledgerEntries.account_id, id);

    const total =
      db
        .select({ c: sql<number>`count(*)` })
        .from(ledgerEntries)
        .where(where)
        .get()?.c ?? 0;

    const rows = db
      .select()
      .from(ledgerEntries)
      .where(where)
      .orderBy(sql`${ledgerEntries.created_at} DESC`)
      .limit(limit)
      .offset(offset)
      .all();

    res.json(listResponse(rows, { page, per_page }, total));
  }),
);

export default router;
