import { expect, test, describe } from "vitest";
import { SERVICES } from "./service-registry";

describe("service-registry.ts for death-registration", () => {
  test("death-registration service is marked built and connected", () => {
    const service = SERVICES.find((s) => s.id === "death-registration");
    expect(service).toBeDefined();
    expect(service?.formBuilt).toBe(true);
    expect(service?.openfnConnected).toBe(true);
  });

  test("has the 3 synchronous portal-form workflows", () => {
    const service = SERVICES.find((s) => s.id === "death-registration");
    const portalWorkflows =
      service?.openfnWorkflows.filter(
        (wf) => wf.trigger === "Webhook: portal form",
      ) ?? [];
    expect(portalWorkflows.length).toBe(3);
  });

  // The portal-form workflows are wired via the webhook registry (staff area →
  // Webhook registration), not environment variables, so none should declare an
  // envVar.
  test("portal-form workflows declare no env var", () => {
    const service = SERVICES.find((s) => s.id === "death-registration");
    const portalWorkflows =
      service?.openfnWorkflows.filter(
        (wf) => wf.trigger === "Webhook: portal form",
      ) ?? [];
    for (const wf of portalWorkflows) {
      expect(wf.envVar).toBeUndefined();
    }
  });
});
