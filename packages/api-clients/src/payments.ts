import { BaseClient } from "./base.js";
import type {
  Account,
  LedgerEntry,
  Disbursement,
  OpenAccountInput,
  RequestDisbursementInput,
  HealthCheckResponse,
} from "./types.js";

export class PaymentsClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3006") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  openAccount(input: OpenAccountInput): Promise<Account> {
    return this.post("/accounts", input);
  }

  getAccounts(filter?: {
    owner_type?: "treasury" | "citizen";
    owner_id?: string;
  }): Promise<Account[]> {
    const params = new URLSearchParams();
    if (filter?.owner_type) params.set("owner_type", filter.owner_type);
    if (filter?.owner_id) params.set("owner_id", filter.owner_id);
    const query = params.toString();
    return this.getList(`/accounts${query ? `?${query}` : ""}`);
  }

  getAccount(id: string): Promise<Account> {
    return this.get(`/accounts/${id}`);
  }

  getAccountLedger(id: string): Promise<LedgerEntry[]> {
    return this.getList(`/accounts/${id}/ledger`);
  }

  /**
   * Request a disbursement (treasury → citizen). May fail at random with a
   * gateway error — the thrown {@link ApiError}'s `code` carries the
   * failure code (e.g. GATEWAY_TIMEOUT) for retry logic.
   */
  disburse(input: RequestDisbursementInput): Promise<Disbursement> {
    return this.post("/payments", input);
  }

  getPayments(filter?: {
    account_id?: string;
    enrollment_id?: string;
    status?: "pending" | "completed" | "failed";
  }): Promise<Disbursement[]> {
    const params = new URLSearchParams();
    if (filter?.account_id) params.set("account_id", filter.account_id);
    if (filter?.enrollment_id) params.set("enrollment_id", filter.enrollment_id);
    if (filter?.status) params.set("status", filter.status);
    const query = params.toString();
    return this.getList(`/payments${query ? `?${query}` : ""}`);
  }

  getPayment(id: string): Promise<Disbursement> {
    return this.get(`/payments/${id}`);
  }
}
