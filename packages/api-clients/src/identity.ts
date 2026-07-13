import { BaseClient, ApiError } from "./base.js";
import type {
  Citizen,
  CreateCitizenInput,
  UpdateCitizenInput,
  HouseholdMember,
  HealthCheckResponse,
  IdentityStats,
} from "./types.js";

export class IdentityClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3001") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  /**
   * Aggregate record counts (total citizens, alive, deceased, households).
   * Use this for headline totals — it returns the counts directly instead of
   * draining every page of the citizen list just to measure its size.
   */
  getStats(): Promise<IdentityStats> {
    return this.get("/admin/stats");
  }

  createCitizen(input: CreateCitizenInput): Promise<Citizen> {
    return this.post("/citizens", input);
  }

  getCitizen(id: string): Promise<Citizen> {
    return this.get(`/citizens/${id}`);
  }

  /**
   * Look up a citizen by national ID. The endpoint returns a single citizen
   * (national IDs are unique) or 404; this returns a 0- or 1-element array so
   * callers can treat lookups uniformly.
   */
  async getCitizenByNationalId(nationalId: string): Promise<Citizen[]> {
    try {
      const citizen = await this.get<Citizen>(
        `/citizens?national_id=${encodeURIComponent(nationalId)}`,
      );
      return [citizen];
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return [];
      throw err;
    }
  }

  listCitizens(): Promise<Citizen[]> {
    return this.getList("/citizens");
  }

  searchCitizens(params: {
    name?: string;
    dob?: string;
  }): Promise<Citizen[]> {
    const query = new URLSearchParams();
    if (params.name !== undefined) query.set("name", params.name);
    if (params.dob !== undefined) query.set("dob", params.dob);
    return this.getList(`/citizens/search?${query.toString()}`);
  }

  updateCitizen(id: string, input: UpdateCitizenInput): Promise<Citizen> {
    return this.patch(`/citizens/${id}`, input);
  }

  getHousehold(citizenId: string): Promise<HouseholdMember[]> {
    return this.get(`/citizens/${citizenId}/household`);
  }

  createHousehold(members: {
    citizen_id: string;
    relationship: string;
  }[]): Promise<{ household_id: string; members: HouseholdMember[] }> {
    return this.post("/households", { members });
  }

  updateHouseholdMembers(
    householdId: string,
    changes: {
      add?: { citizen_id: string; relationship: string }[];
      remove?: string[];
    },
  ): Promise<HouseholdMember[]> {
    return this.patch(`/households/${householdId}/members`, changes);
  }
}
