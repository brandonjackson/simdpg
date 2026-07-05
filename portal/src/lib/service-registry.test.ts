import { expect, test, describe } from "vitest";
import { SERVICES } from "./service-registry";

describe("service-registry.ts for death-registration", () => {
  test("death-registration service has UI properties enabled", () => {
    const service = SERVICES.find(s => s.id === "death-registration");
    expect(service).toBeDefined();
    expect(service?.formBuilt).toBe(true);
    expect(service?.openfnConnected).toBe(true);
  });

  test("death-registration service has the 3 synchronous portal workflows defined", () => {
    const service = SERVICES.find(s => s.id === "death-registration");
    expect(service).toBeDefined();

    const portalWorkflows = service?.openfnWorkflows.filter(
      wf => wf.trigger === "Webhook: portal form"
    ) || [];

    expect(portalWorkflows.length).toBe(3);

    const envVars = portalWorkflows.map(wf => wf.envVar);
    expect(envVars).toContain("OPENFN_DEATH_REGISTRATION_PART1_URL");
    expect(envVars).toContain("OPENFN_DEATH_REGISTRATION_PART2_URL");
    expect(envVars).toContain("OPENFN_DEATH_REGISTRATION_PART3_URL");
  });
});
