import { BaseClient } from "./base.js";
import type {
  Citizen,
  CreateCitizenInput,
  UpdateCitizenInput,
  HouseholdMember,
  HealthCheckResponse,
} from "./types.js";

export class IdentityClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3001") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  createCitizen(input: CreateCitizenInput): Promise<Citizen> {
    return this.post("/citizens", input);
  }

  getCitizen(id: string): Promise<Citizen> {
    return this.get(`/citizens/${id}`);
  }

  getCitizenByNationalId(nationalId: string): Promise<Citizen[]> {
    return this.get(`/citizens?national_id=${encodeURIComponent(nationalId)}`);
  }

  listCitizens(): Promise<Citizen[]> {
    return this.get("/citizens");
  }

  searchCitizens(params: {
    name?: string;
    dob?: string;
  }): Promise<Citizen[]> {
    const query = new URLSearchParams();
    if (params.name) query.set("name", params.name);
    if (params.dob) query.set("dob", params.dob);
    return this.get(`/citizens/search?${query.toString()}`);
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
