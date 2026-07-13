import type { RandomEventGenerator } from "./types";
import { randomNationalIdReg } from "./random-national-id-reg";
import { randomDeath } from "./random-death";
import { randomBirth } from "./random-birth";
import { randomMarriage } from "./random-marriage";
import { randomBenefitEligibility } from "./random-benefit-eligibility";

/** All generators run by the orchestrator, in order. Add new generators here. */
export const REGISTRY: RandomEventGenerator[] = [randomNationalIdReg, randomDeath, randomBirth, randomMarriage, randomBenefitEligibility];

export type { GeneratedEvent, GeneratorContext, RandomEventGenerator } from "./types";
