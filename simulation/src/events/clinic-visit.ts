/**
 * Clinic visit event generator.
 *
 * Rate: ~4 visits per citizen per year.
 * Creates encounter records (checkup or consultation) in the health service.
 */

import { HealthClient } from "@simdpg/api-clients";
import type { Citizen, Patient } from "@simdpg/api-clients";
import {
  randomChoice,
  formatDate,
  log,
  logError,
} from "../utils.js";
import { facilityNames, providerNames } from "../names.js";
import { Report } from "../report.js";

export interface ClinicVisitConfig {
  healthUrl: string;
  citizens: Citizen[];
  simulationDate: Date;
}

const ENCOUNTER_TYPES: ("checkup" | "consultation")[] = ["checkup", "consultation"];

const DIAGNOSES = [
  "Routine examination - no issues",
  "Upper respiratory infection",
  "Mild hypertension",
  "Type 2 diabetes management",
  "Seasonal allergies",
  "Minor musculoskeletal complaint",
  "Gastroenteritis",
  "Skin condition - dermatitis",
  "Anemia follow-up",
  "Mental health screening",
  null, // no diagnosis
  null,
];

export async function runClinicVisits(config: ClinicVisitConfig, report: Report): Promise<number> {
  const health = new HealthClient(config.healthUrl);
  const now = config.simulationDate;

  const aliveCitizens = config.citizens.filter((c) => c.status === "alive");

  // Rate: 4 visits per citizen per year
  const expectedVisits = Math.max(1, Math.round(aliveCitizens.length * 4));

  log(`Clinic visit event: ${expectedVisits} visits planned for ${aliveCitizens.length} alive citizens`);

  // Select random citizens (with replacement since people can visit multiple times)
  let visitCount = 0;

  for (let i = 0; i < expectedVisits; i++) {
    const citizen = randomChoice(aliveCitizens);

    try {
      // Look up their patient record
      const patients = await health.getPatientByCitizen(citizen.id);
      if (patients.length === 0) {
        // Register as patient first if not found
        try {
          const patient = await health.registerPatient({ citizen_id: citizen.id });
          await createEncounter(health, patient.id, now, report);
          visitCount++;
        } catch (regErr) {
          report.failure("clinic_visit", regErr instanceof Error ? regErr.message : String(regErr));
          logError(`Failed to register patient for citizen ${citizen.id}`, regErr);
        }
      } else {
        await createEncounter(health, patients[0].id, now, report);
        visitCount++;
      }
    } catch (err) {
      report.failure("clinic_visit", err instanceof Error ? err.message : String(err));
      logError(`Failed to create clinic visit for citizen ${citizen.id}`, err);
    }
  }

  log(`Clinic visit event complete: ${visitCount} visits`);
  return visitCount;
}

async function createEncounter(
  health: HealthClient,
  patientId: string,
  now: Date,
  report: Report,
): Promise<void> {
  const diagnosis = randomChoice(DIAGNOSES);
  await health.createEncounter({
    patient_id: patientId,
    type: randomChoice(ENCOUNTER_TYPES),
    date: formatDate(now),
    facility: randomChoice(facilityNames),
    provider: randomChoice(providerNames),
    diagnosis: diagnosis ?? undefined,
    status: "completed",
  });
  report.success("clinic_visit");
}
