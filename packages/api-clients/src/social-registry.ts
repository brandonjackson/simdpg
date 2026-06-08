import { BaseClient } from "./base.js";
import type {
  Assessment,
  CreateAssessmentInput,
  TargetingProfile,
  HealthCheckResponse,
} from "./types.js";

export class SocialRegistryClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3007") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  createAssessment(input: CreateAssessmentInput): Promise<Assessment> {
    return this.post("/assessments", input);
  }

  getAssessments(filter?: {
    household_id?: string;
    citizen_id?: string;
    status?: string;
  }): Promise<Assessment[]> {
    const params = new URLSearchParams();
    if (filter?.household_id) params.set("household_id", filter.household_id);
    if (filter?.citizen_id) params.set("citizen_id", filter.citizen_id);
    if (filter?.status) params.set("status", filter.status);
    const query = params.toString();
    return this.getList(`/assessments${query ? `?${query}` : ""}`);
  }

  getAssessment(id: string): Promise<Assessment> {
    return this.get(`/assessments/${id}`);
  }

  /** Targeting profile for a household — used by Benefits eligibility. */
  getTargetingProfile(householdId: string): Promise<TargetingProfile> {
    return this.get(
      `/households/${encodeURIComponent(householdId)}/targeting-profile`,
    );
  }

  queryRegistry(filter?: {
    income_band?: string;
    vulnerability?: string;
    targeting_band?: string;
    targeted?: boolean;
  }): Promise<TargetingProfile[]> {
    const params = new URLSearchParams();
    if (filter?.income_band) params.set("income_band", filter.income_band);
    if (filter?.vulnerability) params.set("vulnerability", filter.vulnerability);
    if (filter?.targeting_band)
      params.set("targeting_band", filter.targeting_band);
    if (filter?.targeted !== undefined)
      params.set("targeted", String(filter.targeted));
    const query = params.toString();
    return this.getList(`/registry${query ? `?${query}` : ""}`);
  }

  recertify(input: CreateAssessmentInput): Promise<Assessment> {
    return this.post("/recertify", input);
  }
}
