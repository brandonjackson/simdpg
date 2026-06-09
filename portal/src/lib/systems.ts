import {
  IdentityClient,
  CivilRegistryClient,
  HealthClient,
  BenefitsClient,
  NotificationsClient,
  PaymentsClient,
  SocialRegistryClient,
  SYSTEM_URLS,
} from "@simdpg/api-clients";

export const identity = new IdentityClient(SYSTEM_URLS.identity);
export const civilRegistry = new CivilRegistryClient(SYSTEM_URLS.civilRegistry);
export const health = new HealthClient(SYSTEM_URLS.health);
export const benefits = new BenefitsClient(SYSTEM_URLS.benefits);
export const notifications = new NotificationsClient(SYSTEM_URLS.notifications);
export const payments = new PaymentsClient(SYSTEM_URLS.payments);
export const socialRegistry = new SocialRegistryClient(
  SYSTEM_URLS.socialRegistry,
);

/**
 * All systems keyed by their canonical slug (matching `source` on emitted
 * events and the `/api/proxy/:system` segment). Used by features that operate
 * uniformly across every system, e.g. webhook-subscription management.
 */
export const SYSTEMS_BY_ID = {
  identity,
  "civil-registry": civilRegistry,
  health,
  benefits,
  notifications,
  payments,
  "social-registry": socialRegistry,
} as const;

export type SystemId = keyof typeof SYSTEMS_BY_ID;
