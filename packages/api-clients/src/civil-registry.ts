import { BaseClient } from "./base.js";
import type {
  BirthRegistration,
  DeathRegistration,
  MarriageRegistration,
  VitalEvent,
  HealthCheckResponse,
} from "./types.js";

export class CivilRegistryClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3002") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  registerBirth(input: {
    child_citizen_id: string;
    mother_citizen_id: string;
    father_citizen_id?: string;
    date_of_birth: string;
    place_of_birth: string;
    registrar_notes?: string;
  }): Promise<BirthRegistration> {
    return this.post("/births", input);
  }

  getBirth(id: string): Promise<BirthRegistration> {
    return this.get(`/births/${id}`);
  }

  getBirthByCitizen(citizenId: string): Promise<BirthRegistration[]> {
    return this.getList(`/births?citizen_id=${encodeURIComponent(citizenId)}`);
  }

  registerDeath(input: {
    citizen_id: string;
    date_of_death: string;
    place_of_death: string;
    cause_of_death?: string;
  }): Promise<DeathRegistration> {
    return this.post("/deaths", input);
  }

  getDeath(id: string): Promise<DeathRegistration> {
    return this.get(`/deaths/${id}`);
  }

  getDeathByCitizen(citizenId: string): Promise<DeathRegistration[]> {
    return this.getList(`/deaths?citizen_id=${encodeURIComponent(citizenId)}`);
  }

  registerMarriage(input: {
    spouse_1_citizen_id: string;
    spouse_2_citizen_id: string;
    date_of_marriage: string;
    place_of_marriage: string;
  }): Promise<MarriageRegistration> {
    return this.post("/marriages", input);
  }

  getMarriage(id: string): Promise<MarriageRegistration> {
    return this.get(`/marriages/${id}`);
  }

  getMarriagesByCitizen(citizenId: string): Promise<MarriageRegistration[]> {
    return this.getList(
      `/marriages?citizen_id=${encodeURIComponent(citizenId)}`,
    );
  }

  getEventsByCitizen(citizenId: string): Promise<VitalEvent[]> {
    return this.getList(`/events?citizen_id=${encodeURIComponent(citizenId)}`);
  }
}
