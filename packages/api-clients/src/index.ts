export { IdentityClient } from "./identity.js";
export { CivilRegistryClient } from "./civil-registry.js";
export { HealthClient } from "./health.js";
export { BenefitsClient } from "./benefits.js";
export { NotificationsClient } from "./notifications.js";
export { PaymentsClient } from "./payments.js";
export { SocialRegistryClient } from "./social-registry.js";
export { BaseClient, ApiError } from "./base.js";

export type * from "./types.js";

export const SYSTEM_URLS = {
  identity: process.env.IDENTITY_URL ?? "http://localhost:3001",
  civilRegistry: process.env.CIVIL_REGISTRY_URL ?? "http://localhost:3002",
  health: process.env.HEALTH_URL ?? "http://localhost:3003",
  benefits: process.env.BENEFITS_URL ?? "http://localhost:3004",
  notifications: process.env.NOTIFICATIONS_URL ?? "http://localhost:3005",
  payments: process.env.PAYMENTS_URL ?? "http://localhost:3006",
  socialRegistry: process.env.SOCIAL_REGISTRY_URL ?? "http://localhost:3007",
} as const;
