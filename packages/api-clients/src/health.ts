import { BaseClient } from "./base.js";
import type {
  Patient,
  Encounter,
  Vaccination,
  OverdueVaccination,
  HealthCheckResponse,
} from "./types.js";

export class HealthClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3003") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  registerPatient(input: {
    citizen_id: string;
    blood_type?: string;
    allergies?: string[];
  }): Promise<Patient> {
    return this.post("/patients", input);
  }

  getPatient(id: string): Promise<Patient> {
    return this.get(`/patients/${id}`);
  }

  getPatientByCitizen(citizenId: string): Promise<Patient[]> {
    return this.getList(
      `/patients?citizen_id=${encodeURIComponent(citizenId)}`,
    );
  }

  updatePatientStatus(citizenId: string, status: "active" | "deceased" | "inactive"): Promise<Patient> {
    return this.patch(`/patients/by-citizen/${encodeURIComponent(citizenId)}`, {
      status,
    });
  }

  createEncounter(input: {
    patient_id: string;
    type: "checkup" | "emergency" | "vaccination" | "consultation";
    date: string;
    facility: string;
    provider: string;
    diagnosis?: string;
    notes?: string;
    status?: "completed" | "scheduled" | "cancelled";
  }): Promise<Encounter> {
    return this.post("/encounters", input);
  }

  getEncounter(id: string): Promise<Encounter> {
    return this.get(`/encounters/${id}`);
  }

  getEncounters(params: {
    patient_id: string;
    type?: string;
  }): Promise<Encounter[]> {
    const query = new URLSearchParams({ patient_id: params.patient_id });
    if (params.type) query.set("type", params.type);
    return this.getList(`/encounters?${query.toString()}`);
  }

  recordVaccination(input: {
    patient_id: string;
    encounter_id?: string;
    vaccine_name: string;
    dose_number: number;
    date_administered: string;
    next_dose_due?: string;
    batch_number: string;
  }): Promise<Vaccination> {
    return this.post("/vaccinations", input);
  }

  getVaccinations(patientId: string): Promise<Vaccination[]> {
    return this.getList(
      `/vaccinations?patient_id=${encodeURIComponent(patientId)}`,
    );
  }

  getOverdueVaccinations(asOf: string): Promise<OverdueVaccination[]> {
    return this.getList(
      `/vaccinations/overdue?as_of=${encodeURIComponent(asOf)}`,
    );
  }
}
