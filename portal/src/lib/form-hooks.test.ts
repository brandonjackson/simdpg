import { expect, test, describe } from "vitest";
import { formHooksForService, getFormHook } from "./form-hooks";

describe("form-hooks.ts for death-registration", () => {
  test("returns exactly 3 form hooks for death-registration", () => {
    const hooks = formHooksForService("death-registration");
    expect(hooks.length).toBe(3);
  });

  test("contains the correct keys and legacy env vars for death registration", () => {
    const lookupHook = getFormHook("death-registration-lookup");
    const previewHook = getFormHook("death-registration-preview");
    const confirmHook = getFormHook("death-registration-confirm");

    expect(lookupHook).toBeDefined();
    expect(lookupHook?.serviceId).toBe("death-registration");
    expect(lookupHook?.legacyEnvVar).toBe("OPENFN_DEATH_REGISTRATION_PART1_URL");

    expect(previewHook).toBeDefined();
    expect(previewHook?.serviceId).toBe("death-registration");
    expect(previewHook?.legacyEnvVar).toBe("OPENFN_DEATH_REGISTRATION_PART2_URL");

    expect(confirmHook).toBeDefined();
    expect(confirmHook?.serviceId).toBe("death-registration");
    expect(confirmHook?.legacyEnvVar).toBe("OPENFN_DEATH_REGISTRATION_PART3_URL");
  });
});
