export { IdentityClient } from "./identity.js";
export { CivilRegistryClient } from "./civil-registry.js";
export { HealthClient } from "./health.js";
export { BenefitsClient } from "./benefits.js";
export { NotificationsClient } from "./notifications.js";
export { PaymentsClient } from "./payments.js";
export { SocialRegistryClient } from "./social-registry.js";
export { BaseClient, ApiError } from "./base.js";

export type * from "./types.js";

// On Railway, services reach each other privately at `<slug>.railway.internal`,
// where Railway derives <slug> from the service name. We don't want to assume a
// particular naming scheme (so nobody ever has to rename a service), so instead
// we read THIS service's own private domain — RAILWAY_PRIVATE_DOMAIN, e.g.
// "simdpgportal.railway.internal" or "portal.railway.internal" — and swap the
// "portal" segment for each system's workspace name. That yields the correct
// sibling host whatever the scheme:
//   portal.railway.internal       -> identity.railway.internal
//   simdpgportal.railway.internal -> simdpgidentity.railway.internal
// No renaming and no per-service URL config. An explicit *_URL still wins, and
// off Railway we fall back to localhost.
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);

function railwayHostFor(service: string): string | null {
  const own = process.env.RAILWAY_PRIVATE_DOMAIN; // this service's private domain
  if (!own) return null;
  const dot = own.indexOf(".");
  const slug = dot === -1 ? own : own.slice(0, dot); // e.g. "simdpgportal"
  const suffix = dot === -1 ? ".railway.internal" : own.slice(dot);
  if (!slug.endsWith("portal")) return null; // unexpected name -> caller falls back
  const prefix = slug.slice(0, -"portal".length); // "" or "simdpg"
  return `${prefix}${service}${suffix}`;
}

function systemUrl(envVar: string, service: string, port: number): string {
  const explicit = process.env[envVar];
  if (explicit) return explicit;
  if (onRailway) {
    const host = railwayHostFor(service) ?? `${service}.railway.internal`;
    return `http://${host}:${port}`;
  }
  return `http://localhost:${port}`;
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
