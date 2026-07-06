import { expect, test, describe } from "vitest";
import { formHooksForService, getFormHook, isFormHookKey } from "./form-hooks";

describe("form-hooks.ts for death-registration", () => {
  test("returns the 3 death-registration form hooks in step order", () => {
    const hooks = formHooksForService("death-registration");
    expect(hooks.map((h) => h.key)).toEqual([
      "death-registration-lookup",
      "death-registration-preview",
      "death-registration-confirm",
    ]);
  });

  test("every step belongs to the death-registration service", () => {
    for (const hook of formHooksForService("death-registration")) {
      expect(hook.serviceId).toBe("death-registration");
    }
  });

  // These are brand-new forms, so they are wired purely through the webhook
  // registry — no OPENFN_* environment-variable fallback. Guard against a
  // legacy env var creeping back in.
  test("death-registration hooks have no legacy env-var fallback", () => {
    for (const hook of formHooksForService("death-registration")) {
      expect(hook.legacyEnvVar).toBeUndefined();
    }
  });

  test("each step hook is resolvable by key", () => {
    expect(getFormHook("death-registration-lookup")).toBeDefined();
    expect(getFormHook("death-registration-preview")).toBeDefined();
    expect(getFormHook("death-registration-confirm")).toBeDefined();
  });
});

describe("form-hooks.ts for marriage-registration", () => {
  test("includes marriage-registration with the expected service and legacy fallback", () => {
    const hook = getFormHook("marriage-registration");
    expect(hook).toBeDefined();
    expect(hook?.serviceId).toBe("marriage-registration");
    expect(hook?.legacyEnvVar).toBe("OPENFN_MARRIAGE_WEBHOOK_URL");
  });
});

describe("form-hooks.ts for benefits-eligibility", () => {
  test("returns benefit-eligibility hooks in step order", () => {
    const hooks = formHooksForService("benefits-eligibility");
    expect(hooks.map((h) => h.key)).toEqual([
      "benefit-eligibility-lookup",
      "benefit-eligibility-check",
      "benefit-eligibility-enrol",
    ]);
  });

  test("benefit-eligibility hooks include expected legacy env vars", () => {
    const hooks = formHooksForService("benefits-eligibility");
    expect(hooks.map((h) => h.legacyEnvVar)).toEqual([
      "OPENFN_BENEFIT_ELIGIBILITY_PART1_URL",
      "OPENFN_BENEFIT_ELIGIBILITY_PART2_URL",
      "OPENFN_BENEFIT_ELIGIBILITY_PART3_URL",
    ]);
  });
});

describe("form-hooks.ts key resolution", () => {
  test("resolves known hook keys", () => {
    expect(isFormHookKey("national-id")).toBe(true);
    expect(isFormHookKey("marriage-registration")).toBe(true);
    expect(isFormHookKey("death-registration-confirm")).toBe(true);
  });

  test("rejects unknown hook keys", () => {
    expect(isFormHookKey("marriage")).toBe(false);
    expect(isFormHookKey("unknown-key")).toBe(false);
    expect(getFormHook("unknown-key")).toBeUndefined();
  });

  test("returns empty list for unknown service", () => {
    expect(formHooksForService("not-a-real-service")).toEqual([]);
  });
});
