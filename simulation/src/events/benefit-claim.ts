/**
 * Benefit claim event generator.
 *
 * Identifies citizens with qualifying events and enrolls them in
 * appropriate benefit programs:
 *   - Newborns (age < 1): child benefit
 *   - Turning 65: senior pension
 *   - Mothers of recent births: maternity grant
 */

import {
  BenefitsClient,
  CivilRegistryClient,
} from "@simdpg/api-clients";
import type { Citizen, Program } from "@simdpg/api-clients";
import {
  ageFromDob,
  log,
  logError,
} from "../utils.js";
import { Report } from "../report.js";

export interface BenefitClaimConfig {
  benefitsUrl: string;
  civilRegistryUrl: string;
  citizens: Citizen[];
  simulationDate: Date;
}

/** Ensure standard benefit programs exist. Returns program IDs. */
async function ensurePrograms(
  benefits: BenefitsClient,
): Promise<{ childBenefit?: Program; seniorPension?: Program; maternityGrant?: Program }> {
  try {
    const programs = await benefits.getPrograms("active");
    const result: { childBenefit?: Program; seniorPension?: Program; maternityGrant?: Program } = {};

    for (const p of programs) {
      if (p.name === "Child Benefit") result.childBenefit = p;
      else if (p.name === "Senior Pension") result.seniorPension = p;
      else if (p.name === "Maternity Grant") result.maternityGrant = p;
    }

    // Create missing programs
    if (!result.childBenefit) {
      result.childBenefit = await benefits.createProgram({
        name: "Child Benefit",
        description: "Monthly benefit for families with children under 5",
        eligibility_rules: { max_child_age: 5 },
        payment_amount: 50,
        payment_frequency: "monthly",
      });
    }
    if (!result.seniorPension) {
      result.seniorPension = await benefits.createProgram({
        name: "Senior Pension",
        description: "Monthly pension for citizens aged 65 and above",
        eligibility_rules: { min_age: 65 },
        payment_amount: 200,
        payment_frequency: "monthly",
      });
    }
    if (!result.maternityGrant) {
      result.maternityGrant = await benefits.createProgram({
        name: "Maternity Grant",
        description: "One-time grant for mothers of newborns",
        eligibility_rules: { event: "birth", parent_role: "mother" },
        payment_amount: 500,
        payment_frequency: "one-time",
      });
    }

    return result;
  } catch (err) {
    logError("Failed to ensure benefit programs", err);
    return {};
  }
}

export async function runBenefitClaims(config: BenefitClaimConfig, report: Report): Promise<number> {
  const benefits = new BenefitsClient(config.benefitsUrl);
  const now = config.simulationDate;

  log("Benefit claim event: checking eligibility...");

  const programs = await ensurePrograms(benefits);
  let claimCount = 0;

  const aliveCitizens = config.citizens.filter((c) => c.status === "alive");

  // 1. Child benefit: newborns (under 1 year old)
  if (programs.childBenefit) {
    const newborns = aliveCitizens.filter((c) => {
      const age = ageFromDob(c.date_of_birth, now);
      return age < 1;
    });

    for (const child of newborns) {
      try {
        // Check if already enrolled
        const enrollments = await benefits.getEnrollments(child.id);
        const alreadyEnrolled = enrollments.some(
          (e) => e.program_id === programs.childBenefit!.id && e.status === "active",
        );
        if (alreadyEnrolled) continue;

        // Check eligibility
        try {
          const eligibility = await benefits.checkEligibility(child.id, programs.childBenefit.id);
          if (!eligibility.eligible) continue;
        } catch {
          // If eligibility check fails, try enrolling anyway
        }

        await benefits.enroll({
          program_id: programs.childBenefit.id,
          citizen_id: child.id,
        });
        report.success("benefit_claim:child");
        claimCount++;
      } catch (err) {
        report.failure("benefit_claim:child", err instanceof Error ? err.message : String(err));
        logError(`Failed to enroll child ${child.id} in child benefit`, err);
      }
    }
  }

  // 2. Senior pension: citizens aged 65+
  if (programs.seniorPension) {
    const seniors = aliveCitizens.filter((c) => {
      const age = ageFromDob(c.date_of_birth, now);
      return age >= 65;
    });

    for (const senior of seniors) {
      try {
        const enrollments = await benefits.getEnrollments(senior.id);
        const alreadyEnrolled = enrollments.some(
          (e) => e.program_id === programs.seniorPension!.id && e.status === "active",
        );
        if (alreadyEnrolled) continue;

        try {
          const eligibility = await benefits.checkEligibility(senior.id, programs.seniorPension.id);
          if (!eligibility.eligible) continue;
        } catch {
          // If eligibility check fails, try enrolling anyway
        }

        await benefits.enroll({
          program_id: programs.seniorPension.id,
          citizen_id: senior.id,
        });
        report.success("benefit_claim:senior");
        claimCount++;
      } catch (err) {
        report.failure("benefit_claim:senior", err instanceof Error ? err.message : String(err));
        logError(`Failed to enroll senior ${senior.id} in pension`, err);
      }
    }
  }

  // 3. Maternity grant: mothers (women aged 18-45 with recent births)
  //    We approximate by checking women with children under 1
  if (programs.maternityGrant) {
    const potentialMothers = aliveCitizens.filter((c) => {
      if (c.sex !== "female") return false;
      const age = ageFromDob(c.date_of_birth, now);
      return age >= 18 && age <= 45;
    });

    // Select a subset -- not all women, just those likely to have had a recent birth
    // Use birth rate to estimate: ~15 per 1000 per year
    const expectedMothers = Math.round((potentialMothers.length * 15) / 1000);
    const shuffled = [...potentialMothers].sort(() => Math.random() - 0.5);
    const selectedMothers = shuffled.slice(0, Math.max(1, expectedMothers));

    for (const mother of selectedMothers) {
      try {
        const enrollments = await benefits.getEnrollments(mother.id);
        const alreadyEnrolled = enrollments.some(
          (e) => e.program_id === programs.maternityGrant!.id,
        );
        if (alreadyEnrolled) continue;

        try {
          const eligibility = await benefits.checkEligibility(mother.id, programs.maternityGrant.id);
          if (!eligibility.eligible) continue;
        } catch {
          // If eligibility check fails, try enrolling anyway
        }

        await benefits.enroll({
          program_id: programs.maternityGrant.id,
          citizen_id: mother.id,
        });
        report.success("benefit_claim:maternity");
        claimCount++;
      } catch (err) {
        report.failure("benefit_claim:maternity", err instanceof Error ? err.message : String(err));
        logError(`Failed to enroll mother ${mother.id} in maternity grant`, err);
      }
    }
  }

  log(`Benefit claim event complete: ${claimCount} claims`);
  return claimCount;
}
