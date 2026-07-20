import { expect, test, describe } from "vitest";
import { FORM_HOOKS, FORM_HOOK_KEYS, type FormHookKey } from "./form-hooks";
import {
  FORM_SAMPLE_PAYLOADS,
  getSamplePayload,
  getSamplePayloadJson,
} from "./form-sample-payloads";

describe("form-sample-payloads.ts", () => {
  test("FORM_HOOK_KEYS stays in sync with FORM_HOOKS", () => {
    // FORM_HOOK_KEYS is a hand-maintained literal tuple; this guards drift.
    expect([...FORM_HOOK_KEYS].sort()).toEqual(
      FORM_HOOKS.map((h) => h.key).sort(),
    );
  });

  test("every form hook has a sample payload", () => {
    for (const hook of FORM_HOOKS) {
      expect(FORM_SAMPLE_PAYLOADS).toHaveProperty(hook.key);
      expect(getSamplePayload(hook.key as FormHookKey)).toBeDefined();
    }
  });

  test("has no samples for keys that are not form hooks", () => {
    const hookKeys = new Set<string>(FORM_HOOKS.map((h) => h.key));
    for (const key of Object.keys(FORM_SAMPLE_PAYLOADS)) {
      expect(hookKeys.has(key)).toBe(true);
    }
  });

  test("getSamplePayloadJson returns pretty-printed, parseable JSON", () => {
    const json = getSamplePayloadJson("national-id");
    expect(json).toContain("\n"); // pretty-printed (2-space indent)
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({
      given_name: expect.any(String),
      family_name: expect.any(String),
      email: expect.any(String),
    });
  });

  test("getSamplePayloadJson falls back to empty object for unknown keys", () => {
    expect(getSamplePayloadJson("not-a-real-hook")).toBe("{}");
  });

  test("sample payloads reflect documented single-field lookups", () => {
    expect(getSamplePayload("death-registration-lookup")).toMatchObject({
      national_id: expect.any(String),
    });
    expect(getSamplePayload("benefit-eligibility-check")).toMatchObject({
      citizen_id: expect.any(String),
      program_id: expect.any(String),
    });
  });
});
