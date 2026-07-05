import { expect, test, describe } from "vitest";
import { formHooksForService, getFormHook } from "./form-hooks";

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
