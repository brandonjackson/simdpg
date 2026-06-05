import {
  IdentityClient,
  CivilRegistryClient,
  HealthClient,
  BenefitsClient,
  SYSTEM_URLS,
} from "@simdpg/api-clients";

export const identity = new IdentityClient(SYSTEM_URLS.identity);
export const civilRegistry = new CivilRegistryClient(SYSTEM_URLS.civilRegistry);
export const health = new HealthClient(SYSTEM_URLS.health);
export const benefits = new BenefitsClient(SYSTEM_URLS.benefits);
