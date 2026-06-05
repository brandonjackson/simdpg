export interface Citizen {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string;
  sex: "male" | "female";
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
  addresses?: Omit<Address, "id" | "citizen_id">[];
  household_id?: string;
  relationship?: "head" | "spouse" | "child" | "other";
}

export interface UpdateCitizenInput {
  given_name?: string;
  family_name?: string;
  date_of_birth?: string;
  sex?: "male" | "female";
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

export interface HealthCheckResponse {
  status: "ok";
  service: string;
  version: string;
}

export interface ErrorResponse {
  error: string;
}
