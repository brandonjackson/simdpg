import type { RandomEventGenerator } from "./types";
import { randomNationalIdReg } from "./random-national-id-reg";

/** All generators run by the orchestrator, in order. Add new generators here. */
export const REGISTRY: RandomEventGenerator[] = [randomNationalIdReg];

export type { GeneratedEvent, GeneratorContext, RandomEventGenerator } from "./types";
