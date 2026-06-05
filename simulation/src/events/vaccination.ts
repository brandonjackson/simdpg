/**
 * Vaccination event generator.
 *
 * Children: age-appropriate vaccines based on standard schedule.
 *   - BCG: at birth
 *   - OPV: 6 months, 1 year
 *   - DPT: 2 months, 4 months, 6 months
 *   - Measles: 9 months, 5 years
 *
 * Elderly 65+: annual flu vaccine.
 *
 * Checks existing vaccination history and only administers due vaccines.
 */

import { HealthClient } from "@simdpg/api-clients";
import type { Citizen } from "@simdpg/api-clients";
import {
  randomChoice,
  randomInt,
  ageFromDob,
  formatDate,
  log,
  logError,
} from "../utils.js";
import { facilityNames, providerNames } from "../names.js";
import { Report } from "../report.js";

export interface VaccinationConfig {
  healthUrl: string;
  citizens: Citizen[];
  simulationDate: Date;
}

interface VaccineScheduleEntry {
  vaccine_name: string;
  dose_number: number;
  /** Minimum age in months for this dose. */
  min_age_months: number;
  /** Next dose due in months from this dose (null if final). */
  next_dose_months: number | null;
}

const CHILD_VACCINE_SCHEDULE: VaccineScheduleEntry[] = [
  { vaccine_name: "BCG", dose_number: 1, min_age_months: 0, next_dose_months: null },
  { vaccine_name: "OPV", dose_number: 1, min_age_months: 6, next_dose_months: 6 },
  { vaccine_name: "OPV", dose_number: 2, min_age_months: 12, next_dose_months: null },
  { vaccine_name: "DPT", dose_number: 1, min_age_months: 2, next_dose_months: 2 },
  { vaccine_name: "DPT", dose_number: 2, min_age_months: 4, next_dose_months: 2 },
  { vaccine_name: "DPT", dose_number: 3, min_age_months: 6, next_dose_months: null },
  { vaccine_name: "Measles", dose_number: 1, min_age_months: 9, next_dose_months: 51 },
  { vaccine_name: "Measles", dose_number: 2, min_age_months: 60, next_dose_months: null },
];

function ageInMonths(dob: string, asOf: Date): number {
  const birth = new Date(dob);
  return (asOf.getFullYear() - birth.getFullYear()) * 12 + (asOf.getMonth() - birth.getMonth());
}

function generateBatchNumber(): string {
  const prefix = randomChoice(["VAX", "BCG", "OPV", "DPT", "MMR", "FLU"]);
  return `${prefix}-${randomInt(100000, 999999)}`;
}

export async function runVaccinations(config: VaccinationConfig, report: Report): Promise<number> {
  const health = new HealthClient(config.healthUrl);
  const now = config.simulationDate;

  const aliveCitizens = config.citizens.filter((c) => c.status === "alive");

  // Select children (under 6) and elderly (65+)
  const children = aliveCitizens.filter((c) => {
    const age = ageFromDob(c.date_of_birth, now);
    return age >= 0 && age < 6;
  });

  const elderly = aliveCitizens.filter((c) => {
    const age = ageFromDob(c.date_of_birth, now);
    return age >= 65;
  });

  log(`Vaccination event: ${children.length} children, ${elderly.length} elderly eligible`);

  let vaccinationCount = 0;

  // Process children
  for (const child of children) {
    try {
      const patients = await health.getPatientByCitizen(child.id);
      if (patients.length === 0) continue;

      const patientId = patients[0].id;
      const existingVaccinations = await health.getVaccinations(patientId);
      const childAgeMonths = ageInMonths(child.date_of_birth, now);

      // Find due vaccines
      for (const entry of CHILD_VACCINE_SCHEDULE) {
        if (childAgeMonths < entry.min_age_months) continue;

        // Check if this dose already administered
        const alreadyGiven = existingVaccinations.some(
          (v) => v.vaccine_name === entry.vaccine_name && v.dose_number === entry.dose_number,
        );
        if (alreadyGiven) continue;

        // Administer vaccine
        try {
          // Create encounter for vaccination
          const encounter = await health.createEncounter({
            patient_id: patientId,
            type: "vaccination",
            date: formatDate(now),
            facility: randomChoice(facilityNames),
            provider: randomChoice(providerNames),
            notes: `${entry.vaccine_name} dose ${entry.dose_number}`,
            status: "completed",
          });

          let nextDoseDue: string | undefined;
          if (entry.next_dose_months != null) {
            const nextDate = new Date(now);
            nextDate.setMonth(nextDate.getMonth() + entry.next_dose_months);
            nextDoseDue = formatDate(nextDate);
          }

          await health.recordVaccination({
            patient_id: patientId,
            encounter_id: encounter.id,
            vaccine_name: entry.vaccine_name,
            dose_number: entry.dose_number,
            date_administered: formatDate(now),
            next_dose_due: nextDoseDue,
            batch_number: generateBatchNumber(),
          });
          report.success("vaccination");
          vaccinationCount++;
        } catch (err) {
          report.failure("vaccination", err instanceof Error ? err.message : String(err));
          logError(`Failed to vaccinate child ${child.id} with ${entry.vaccine_name}`, err);
        }
      }
    } catch (err) {
      report.failure("vaccination", err instanceof Error ? err.message : String(err));
      logError(`Failed to process vaccinations for child ${child.id}`, err);
    }
  }

  // Process elderly -- annual flu vaccine
  for (const person of elderly) {
    try {
      const patients = await health.getPatientByCitizen(person.id);
      if (patients.length === 0) continue;

      const patientId = patients[0].id;
      const existingVaccinations = await health.getVaccinations(patientId);

      // Check if flu vaccine given this year
      const thisYear = now.getFullYear();
      const hadFluThisYear = existingVaccinations.some(
        (v) =>
          v.vaccine_name === "Influenza" &&
          new Date(v.date_administered).getFullYear() === thisYear,
      );
      if (hadFluThisYear) continue;

      // Count previous flu doses for dose number
      const previousFluDoses = existingVaccinations.filter(
        (v) => v.vaccine_name === "Influenza",
      ).length;

      try {
        const encounter = await health.createEncounter({
          patient_id: patientId,
          type: "vaccination",
          date: formatDate(now),
          facility: randomChoice(facilityNames),
          provider: randomChoice(providerNames),
          notes: "Annual influenza vaccination",
          status: "completed",
        });

        const nextYear = new Date(now);
        nextYear.setFullYear(nextYear.getFullYear() + 1);

        await health.recordVaccination({
          patient_id: patientId,
          encounter_id: encounter.id,
          vaccine_name: "Influenza",
          dose_number: previousFluDoses + 1,
          date_administered: formatDate(now),
          next_dose_due: formatDate(nextYear),
          batch_number: generateBatchNumber(),
        });
        report.success("vaccination");
        vaccinationCount++;
      } catch (err) {
        report.failure("vaccination", err instanceof Error ? err.message : String(err));
        logError(`Failed to vaccinate elderly ${person.id}`, err);
      }
    } catch (err) {
      report.failure("vaccination", err instanceof Error ? err.message : String(err));
      logError(`Failed to process vaccination for elderly ${person.id}`, err);
    }
  }

  log(`Vaccination event complete: ${vaccinationCount} vaccinations`);
  return vaccinationCount;
}
