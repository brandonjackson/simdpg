import { describe, expect, test } from "vitest";
import { FORM_HOOKS } from "./form-hooks";
import {
  FORM_SAMPLE_PAYLOADS,
  getSamplePayloadJson,
} from "./form-sample-payloads";

describe("form-sample-payloads.ts", () => {
  test("every form hook has a sample payload", () => {
    for (const hook of FORM_HOOKS) {
      expect(FORM_SAMPLE_PAYLOADS).toHaveProperty(hook.key);
    }
  });

  test("no sample payloads exist for unknown keys", () => {
    const hookKeys = new Set(FORM_HOOKS.map((h) => h.key));
    for (const key of Object.keys(FORM_SAMPLE_PAYLOADS)) {
      expect(hookKeys.has(key as (typeof FORM_HOOKS)[number]["key"])).toBe(true);
    }
  });

  test("getSamplePayloadJson returns pretty-printed, parseable JSON", () => {
    for (const hook of FORM_HOOKS) {
      const json = getSamplePayloadJson(hook.key);
      expect(json).toContain("\n"); // pretty-printed with indentation
      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.parse(json)).toEqual(FORM_SAMPLE_PAYLOADS[hook.key]);
    }
  });

  test("getSamplePayloadJson falls back to an empty object for unknown keys", () => {
    expect(getSamplePayloadJson("not-a-real-form")).toBe("{}");
  });

  test("known payloads carry the fields their form contract documents", () => {
    expect(getSamplePayloadJson("national-id")).toContain("phone_number");
    expect(
      JSON.parse(getSamplePayloadJson("marriage-registration")),
    ).toMatchObject({
      spouse_1_national_id: expect.any(String),
      spouse_2_national_id: expect.any(String),
    });
    expect(
      JSON.parse(getSamplePayloadJson("death-registration-lookup")),
    ).toEqual({ national_id: expect.any(String) });
  });
});
