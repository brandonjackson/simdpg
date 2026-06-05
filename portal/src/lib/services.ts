import {
  IdentityClient,
  CivilRegistryClient,
  HealthClient,
  BenefitsClient,
  SERVICE_URLS,
} from "@simdpg/api-clients";

export const identity = new IdentityClient(SERVICE_URLS.identity);
export const civilRegistry = new CivilRegistryClient(SERVICE_URLS.civilRegistry);
export const health = new HealthClient(SERVICE_URLS.health);
export const benefits = new BenefitsClient(SERVICE_URLS.benefits);
