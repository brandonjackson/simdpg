export { IdentityClient } from "./identity.js";
export { CivilRegistryClient } from "./civil-registry.js";
export { HealthClient } from "./health.js";
export { BenefitsClient } from "./benefits.js";
export { NotificationsClient } from "./notifications.js";
export { PaymentsClient } from "./payments.js";
export { SocialRegistryClient } from "./social-registry.js";
export { BaseClient, ApiError } from "./base.js";

export type * from "./types.js";

// On Railway, every service shares a project and reaches the others over the
// private network at `http://<service-name>.railway.internal:<port>`. As long
// as the system services are named after their workspace (identity,
// civil-registry, ...), we can derive those URLs from the same name+port
// convention the runtime uses — so the portal needs zero per-service URL vars.
// An explicit *_URL env var always wins; off Railway we default to localhost.
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);

function systemUrl(envVar: string, service: string, port: number): string {
  const explicit = process.env[envVar];
  if (explicit) return explicit;
  return onRailway
    ? `http://${service}.railway.internal:${port}`
    : `http://localhost:${port}`;
}

export const SYSTEM_URLS = {
  identity: systemUrl("IDENTITY_URL", "identity", 3001),
  civilRegistry: systemUrl("CIVIL_REGISTRY_URL", "civil-registry", 3002),
  health: systemUrl("HEALTH_URL", "health", 3003),
  benefits: systemUrl("BENEFITS_URL", "benefits", 3004),
  notifications: systemUrl("NOTIFICATIONS_URL", "notifications", 3005),
  payments: systemUrl("PAYMENTS_URL", "payments", 3006),
  socialRegistry: systemUrl("SOCIAL_REGISTRY_URL", "social-registry", 3007),
} as const;
