export interface Citizen {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: "male" | "female";
  email: string | null;
  phone_number: string | null;
  date_of_death: string | null;
  status: "alive" | "deceased";
  created_at: string;
  updated_at: string;
  addresses?: Address[];
}

export interface Address {
  id: string;
  citizen_id: string;
  type: "residential" | "mailing";
  line_1: string;
  line_2: string | null;
  city: string;
  postal_code: string;
  from_date: string;
  to_date: string | null;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  citizen_id: string;
  relationship: "head" | "spouse" | "child" | "other";
  from_date: string;
  to_date: string | null;
}

export interface CreateCitizenInput {
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: "male" | "female";
  email?: string | null;
  phone_number?: string | null;
  addresses?: Omit<Address, "id" | "citizen_id">[];
  household_id?: string;
  relationship?: "head" | "spouse" | "child" | "other";
}

export interface UpdateCitizenInput {
  given_name?: string;
  family_name?: string;
  date_of_birth?: string;
  sex?: "male" | "female";
  email?: string | null;
  phone_number?: string | null;
  date_of_death?: string;
  status?: "alive" | "deceased";
}

export interface BirthRegistration {
  id: string;
  child_citizen_id: string;
  mother_citizen_id: string;
  father_citizen_id: string | null;
  date_of_birth: string;
  place_of_birth: string;
  registration_date: string;
  registrar_notes: string | null;
  status: "registered" | "amended" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface DeathRegistration {
  id: string;
  citizen_id: string;
  date_of_death: string;
  place_of_death: string;
  cause_of_death: string | null;
  registration_date: string;
  status: "registered" | "amended" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface MarriageRegistration {
  id: string;
  spouse_1_citizen_id: string;
  spouse_2_citizen_id: string;
  date_of_marriage: string;
  place_of_marriage: string;
  registration_date: string;
  status: "registered" | "divorced" | "annulled";
  created_at: string;
  updated_at: string;
}

export interface VitalEvent {
  type: "birth" | "death" | "marriage";
  date: string;
  id: string;
  details: Record<string, unknown>;
}

export interface Patient {
  id: string;
  citizen_id: string;
  blood_type: string | null;
  allergies: string[] | null;
  registered_at: string;
  status: "active" | "deceased" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Encounter {
  id: string;
  patient_id: string;
  type: "checkup" | "emergency" | "vaccination" | "consultation";
  date: string;
  facility: string;
  provider: string;
  diagnosis: string | null;
  notes: string | null;
  status: "completed" | "scheduled" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface Vaccination {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  vaccine_name: string;
  dose_number: number;
  date_administered: string;
  next_dose_due: string | null;
  batch_number: string;
  created_at: string;
  updated_at: string;
}

export interface OverdueVaccination {
  patient_id: string;
  citizen_id: string;
  vaccine_name: string;
  next_dose_due: string;
}

export interface Program {
  id: string;
  name: string;
  description: string;
  eligibility_rules: Record<string, unknown>;
  payment_amount: number;
  payment_frequency: "monthly" | "one-time" | "quarterly";
  status: "active" | "suspended" | "closed";
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  program_id: string;
  citizen_id: string;
  household_id: string | null;
  status: "pending" | "active" | "suspended" | "terminated";
  enrolled_at: string;
  terminated_at: string | null;
  termination_reason: string | null;
  created_at: string;
  updated_at: string;
  program_name?: string;
}

export interface Payment {
  id: string;
  enrollment_id: string;
  amount: number;
  currency: string;
  status: "scheduled" | "paid" | "failed";
  scheduled_date: string;
  paid_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  citizen_id: string;
  program_id: string;
}

export interface VulnerabilityIndicator {
  id: string;
  indicator:
    | "disability"
    | "elderly"
    | "single_parent"
    | "chronic_illness"
    | "unemployed"
    | "dependents";
  value: number;
  weight: number;
}

export interface Assessment {
  id: string;
  household_id: string;
  head_citizen_id: string;
  pmt_score: number;
  income_band: "low" | "medium" | "high";
  data_source: "interview" | "imported" | "recertified";
  assessed_at: string;
  valid_until: string;
  status: "active" | "expired" | "superseded";
  created_at: string;
  updated_at: string;
  indicators: VulnerabilityIndicator[];
  superseded_assessment_id?: string | null;
}

export interface CreateAssessmentInput {
  household_id: string;
  head_citizen_id: string;
  pmt_score: number;
  income_band?: "low" | "medium" | "high";
  data_source?: "interview" | "imported" | "recertified";
  assessed_at?: string;
  valid_until?: string;
  indicators?: {
    indicator: VulnerabilityIndicator["indicator"];
    value?: number;
    weight?: number;
  }[];
}

export interface TargetingProfile {
  household_id: string;
  has_assessment: boolean;
  assessment_id: string | null;
  head_citizen_id: string | null;
  pmt_score: number | null;
  income_band: "low" | "medium" | "high" | null;
  vulnerability_flags: VulnerabilityIndicator["indicator"][];
  vulnerability_score: number;
  targeting_band: "priority" | "eligible" | "not_targeted";
  targeted: boolean;
  assessed_at: string | null;
  valid_until: string | null;
  status: "active" | "expired" | "superseded" | null;
  expired: boolean;
}

export interface HealthCheckResponse {
  status: "ok";
  system: string;
  version: string;
}

export interface Notification {
  id: string;
  citizen_id: string;
  channel: "email" | "sms";
  destination: string;
  subject: string | null;
  body: string;
  source_system: string;
  source_event: string | null;
  status: "pending" | "sent" | "delivered" | "failed";
  attempts: number;
  sent_at: string | null;
  delivered_at: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendNotificationInput {
  citizen_id: string;
  channel: "email" | "sms";
  destination: string;
  subject?: string | null;
  body: string;
  source_system: string;
  source_event?: string | null;
}

export interface Account {
  id: string;
  owner_type: "treasury" | "citizen";
  owner_id: string;
  balance: number;
  currency: string;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  payment_id: string;
  account_id: string;
  direction: "debit" | "credit";
  amount: number;
  currency: string;
  created_at: string;
}

export type PaymentFailureCode =
  | "INSUFFICIENT_FUNDS"
  | "ACCOUNT_NOT_FOUND"
  | "GATEWAY_TIMEOUT"
  | "DUPLICATE_TRANSACTION"
  | "SERVICE_UNAVAILABLE";

export interface Disbursement {
  id: string;
  idempotency_key: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  currency: string;
  enrollment_id: string | null;
  reference: string | null;
  status: "pending" | "completed" | "failed";
  failure_code: PaymentFailureCode | null;
  failure_message: string | null;
  created_at: string;
  completed_at: string | null;
  ledger_entries?: LedgerEntry[];
}

export interface OpenAccountInput {
  owner_type: "treasury" | "citizen";
  owner_id?: string;
  initial_balance?: number;
  currency?: string;
}

export interface RequestDisbursementInput {
  idempotency_key: string;
  to_account_id: string;
  from_account_id?: string;
  amount: number;
  currency?: string;
  enrollment_id?: string;
  reference?: string;
}

/**
 * A registered webhook target for a single event type. Systems deliver an
 * emitted event to every subscription whose `event_type` matches; multiple
 * subscriptions may exist for the same event (fan-out to several consumers).
 */
export interface WebhookSubscription {
  id: string;
  event_type: string;
  target_url: string;
  created_at: string;
}

export interface CreateWebhookSubscriptionInput {
  event_type: string;
  target_url: string;
}

/** DCI error envelope returned by every system. */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Pagination metadata on DCI list responses. */
export interface ListMeta {
  page: number;
  per_page: number;
  total: number;
}

/** Standard DCI list envelope: `{ data, meta }`. */
export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}
