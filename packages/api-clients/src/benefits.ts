import { BaseClient } from "./base.js";
import type {
  Program,
  Enrollment,
  Payment,
  EligibilityResult,
  HealthCheckResponse,
} from "./types.js";

export class BenefitsClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3004") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  getPrograms(status?: string): Promise<Program[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.get(`/programs${query}`);
  }

  getProgram(id: string): Promise<Program> {
    return this.get(`/programs/${id}`);
  }

  createProgram(input: {
    name: string;
    description: string;
    eligibility_rules: Record<string, unknown>;
    payment_amount: number;
    payment_frequency: "monthly" | "one-time" | "quarterly";
  }): Promise<Program> {
    return this.post("/programs", input);
  }

  checkEligibility(
    citizenId: string,
    programId: string,
  ): Promise<EligibilityResult> {
    return this.post("/eligibility/check", {
      citizen_id: citizenId,
      program_id: programId,
    });
  }

  enroll(input: {
    program_id: string;
    citizen_id: string;
    household_id?: string;
  }): Promise<Enrollment> {
    return this.post("/enrollments", input);
  }

  getEnrollments(citizenId: string): Promise<Enrollment[]> {
    return this.get(
      `/enrollments?citizen_id=${encodeURIComponent(citizenId)}`,
    );
  }

  getEnrollment(id: string): Promise<Enrollment> {
    return this.get(`/enrollments/${id}`);
  }

  updateEnrollment(
    id: string,
    input: { status: string; termination_reason?: string },
  ): Promise<Enrollment> {
    return this.patch(`/enrollments/${id}`, input);
  }

  getPayments(enrollmentId: string): Promise<Payment[]> {
    return this.get(
      `/payments?enrollment_id=${encodeURIComponent(enrollmentId)}`,
    );
  }

  schedulePayments(input: {
    enrollment_id: string;
    amount: number;
    currency?: string;
    count?: number;
    start_date?: string;
  }): Promise<Payment[]> {
    return this.post("/payments/schedule", input);
  }
}
