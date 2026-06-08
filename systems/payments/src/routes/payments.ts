import { Router } from "express";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ApiError, notFound, getPagination, listResponse } from "@simdpg/system-kit";
import { db } from "../db/index.js";
import { accounts, payments, ledgerEntries } from "../db/schema.js";
import { rollFailure } from "../payments.config.js";
import { emitWebhook } from "../webhooks.js";
import { asyncHandler, TREASURY_OWNER_ID } from "./helpers.js";

const router = Router();

type Account = typeof accounts.$inferSelect;
type Payment = typeof payments.$inferSelect;
type LedgerEntry = typeof ledgerEntries.$inferSelect;

const disburseSchema = z.object({
  /** Idempotency key — replaying a completed key returns the original payment. */
  idempotency_key: z.string().min(1),
  /** Beneficiary (citizen) account. */
  to_account_id: z.string().uuid(),
  /** Source account; defaults to the treasury account when omitted. */
  from_account_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  currency: z.string().min(1).default("SIM"),
  enrollment_id: z.string().optional(),
  reference: z.string().optional(),
});

/** Load the ledger entries written for a payment (debit + credit, if any). */
function ledgerFor(paymentId: string): LedgerEntry[] {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.payment_id, paymentId))
    .all();
}

/** Attach a payment's ledger entries for the response body. */
function withLedger(payment: Payment): Payment & { ledger_entries: LedgerEntry[] } {
  return { ...payment, ledger_entries: ledgerFor(payment.id) };
}

/**
 * POST /payments — request a disbursement (treasury -> citizen).
 *
 * Mocked: no real money moves. A success writes paired ledger entries (debit
 * treasury, credit citizen) and bumps both balances. The gateway fails at
 * random per payments.config.ts; genuine ACCOUNT_NOT_FOUND / INSUFFICIENT_FUNDS
 * checks always apply so the ledger stays consistent. Requires an idempotency
 * key — replaying a completed key returns the original payment unchanged.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = disburseSchema.parse(req.body);

    // ---- Idempotency: replay a previously completed payment ---------------
    const existing = db
      .select()
      .from(payments)
      .where(eq(payments.idempotency_key, body.idempotency_key))
      .get();

    if (existing && existing.status === "completed") {
      res.status(200).json(withLedger(existing));
      return;
    }

    // A prior *failed* attempt with this key is retryable: reuse its row.
    const paymentId = existing ? existing.id : uuidv4();
    const isRetry = Boolean(existing);
    const now = new Date().toISOString();

    // ---- Resolve accounts -------------------------------------------------
    const fromAccount: Account | undefined = body.from_account_id
      ? db.select().from(accounts).where(eq(accounts.id, body.from_account_id)).get()
      : db.select().from(accounts).where(eq(accounts.owner_id, TREASURY_OWNER_ID)).get();

    const toAccount = db
      .select()
      .from(accounts)
      .where(eq(accounts.id, body.to_account_id))
      .get();

    // ---- Decide the outcome ----------------------------------------------
    // Genuine validation takes precedence over the random roll so the ledger
    // never moves against a missing account or an overdrawn treasury.
    let failureCode: string | null = null;
    let failureMessage = "";
    let httpStatus = 422;

    if (!toAccount || toAccount.status === "closed") {
      failureCode = "ACCOUNT_NOT_FOUND";
      failureMessage =
        "The beneficiary account or bank details could not be found or are invalid.";
      httpStatus = 404;
    } else if (!fromAccount || fromAccount.status === "closed") {
      failureCode = "ACCOUNT_NOT_FOUND";
      failureMessage = "The disbursing treasury account could not be found.";
      httpStatus = 404;
    } else {
      const rolled = rollFailure();
      if (rolled) {
        failureCode = rolled.code;
        failureMessage = rolled.message;
        httpStatus = rolled.httpStatus;
      } else if (fromAccount.balance < body.amount) {
        failureCode = "INSUFFICIENT_FUNDS";
        failureMessage =
          "The disbursing treasury account has insufficient funds to complete this transfer.";
        httpStatus = 402;
      }
    }

    const baseValues = {
      id: paymentId,
      idempotency_key: body.idempotency_key,
      from_account_id: fromAccount?.id ?? null,
      to_account_id: toAccount?.id ?? null,
      amount: body.amount,
      currency: body.currency,
      enrollment_id: body.enrollment_id ?? null,
      reference: body.reference ?? null,
      created_at: existing?.created_at ?? now,
    };

    /** Upsert the payment row (insert fresh, or update a retried row). */
    function persist(fields: Partial<Payment>): void {
      if (isRetry) {
        db.update(payments)
          .set({ ...baseValues, ...fields })
          .where(eq(payments.id, paymentId))
          .run();
      } else {
        db.insert(payments)
          .values({ ...baseValues, ...fields } as typeof payments.$inferInsert)
          .run();
      }
    }

    // ---- Failure path -----------------------------------------------------
    if (failureCode) {
      persist({
        status: "failed",
        failure_code: failureCode,
        failure_message: failureMessage,
        completed_at: null,
      });

      const failed = db.select().from(payments).where(eq(payments.id, paymentId)).get()!;
      emitWebhook("payment.failed", failed as Record<string, unknown>);

      throw new ApiError(httpStatus, failureCode, failureMessage, {
        payment_id: paymentId,
        idempotency_key: body.idempotency_key,
      });
    }

    // ---- Success path — move money as paired ledger entries ---------------
    // Non-null after the checks above.
    const treasury = fromAccount as Account;
    const beneficiary = toAccount as Account;

    db.transaction((tx) => {
      persist({
        status: "completed",
        failure_code: null,
        failure_message: null,
        completed_at: now,
      });

      tx.insert(ledgerEntries)
        .values([
          {
            id: uuidv4(),
            payment_id: paymentId,
            account_id: treasury.id,
            direction: "debit",
            amount: body.amount,
            currency: body.currency,
            created_at: now,
          },
          {
            id: uuidv4(),
            payment_id: paymentId,
            account_id: beneficiary.id,
            direction: "credit",
            amount: body.amount,
            currency: body.currency,
            created_at: now,
          },
        ])
        .run();

      tx.update(accounts)
        .set({ balance: treasury.balance - body.amount, updated_at: now })
        .where(eq(accounts.id, treasury.id))
        .run();
      tx.update(accounts)
        .set({ balance: beneficiary.balance + body.amount, updated_at: now })
        .where(eq(accounts.id, beneficiary.id))
        .run();
    });

    const completed = db.select().from(payments).where(eq(payments.id, paymentId)).get()!;
    emitWebhook("payment.completed", completed as Record<string, unknown>);

    res.status(isRetry ? 200 : 201).json(withLedger(completed));
  }),
);

/**
 * GET /payments — list payments, filter by account, enrollment_id, or status.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const accountId = req.query.account_id as string | undefined;
    const enrollmentId = req.query.enrollment_id as string | undefined;
    const status = req.query.status as string | undefined;
    const { offset, limit, page, per_page } = getPagination(req);

    const filters: SQL[] = [];
    if (accountId) {
      filters.push(
        sql`(${payments.from_account_id} = ${accountId} OR ${payments.to_account_id} = ${accountId})`,
      );
    }
    if (enrollmentId) filters.push(eq(payments.enrollment_id, enrollmentId));
    if (status) {
      filters.push(eq(payments.status, status as "pending" | "completed" | "failed"));
    }
    const where = filters.length ? and(...filters) : undefined;

    const total =
      db.select({ c: sql<number>`count(*)` }).from(payments).where(where).get()
        ?.c ?? 0;

    const rows = db
      .select()
      .from(payments)
      .where(where)
      .orderBy(sql`${payments.created_at} DESC`)
      .limit(limit)
      .offset(offset)
      .all();

    res.json(listResponse(rows, { page, per_page }, total));
  }),
);

/**
 * GET /payments/:id — get a single payment with its ledger entries.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const payment = db.select().from(payments).where(eq(payments.id, id)).get();
    if (!payment) throw notFound("Payment not found");
    res.json(withLedger(payment));
  }),
);

export default router;
