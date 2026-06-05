/**
 * Typed HTTP clients for SimDPG services.
 *
 * Each client will wrap fetch() with typed request/response bodies
 * for the corresponding service API.
 */

export const SERVICE_URLS = {
  identity: process.env.IDENTITY_URL ?? "http://localhost:3001",
  civilRegistry: process.env.CIVIL_REGISTRY_URL ?? "http://localhost:3002",
  health: process.env.HEALTH_URL ?? "http://localhost:3003",
  benefits: process.env.BENEFITS_URL ?? "http://localhost:3004",
} as const;
