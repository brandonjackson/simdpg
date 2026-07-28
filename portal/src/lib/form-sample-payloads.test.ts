import { expect, test, describe } from "vitest";
import {
  ALL_FORM_HOOK_KEYS,
  FORM_SAMPLE_PAYLOADS,
  SAMPLE_PAYLOAD_KEYS,
  getSamplePayloadJson,
} from "./form-sample-payloads";

describe("form-sample-payloads.ts", () => {
  test("every form hook has a bespoke sample payload", () => {
    for (const key of ALL_FORM_HOOK_KEYS) {
      expect(SAMPLE_PAYLOAD_KEYS, `missing sample for ${key}`).toContain(key);
    }
  });

  test("no sample payload exists for an unknown form key", () => {
    for (const key of SAMPLE_PAYLOAD_KEYS) {
      expect(ALL_FORM_HOOK_KEYS, `stray sample for ${key}`).toContain(key);
    }
  });

  test("each sample payload is a non-empty object", () => {
    for (const key of SAMPLE_PAYLOAD_KEYS) {
      const payload = FORM_SAMPLE_PAYLOADS[key];
      expect(typeof payload).toBe("object");
      expect(payload).not.toBeNull();
      expect(Object.keys(payload as object).length).toBeGreaterThan(0);
    }
  });

  test("getSamplePayloadJson returns pretty-printed, valid JSON", () => {
    for (const key of ALL_FORM_HOOK_KEYS) {
      const json = getSamplePayloadJson(key);
      // Pretty-printed (2-space indent) => contains newlines.
      expect(json).toContain("\n");
      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.parse(json)).toEqual(FORM_SAMPLE_PAYLOADS[key]);
    }
  });

  test("unknown keys fall back to an empty object", () => {
    expect(getSamplePayloadJson("not-a-real-key")).toBe("{}");
  });

  test("known payload shapes match their documented contracts", () => {
    expect(FORM_SAMPLE_PAYLOADS["death-registration-lookup"]).toEqual({
      national_id: expect.any(String),
    });
    expect(
      Object.keys(FORM_SAMPLE_PAYLOADS["benefit-eligibility-check"] as object),
    ).toEqual(["citizen_id", "program_id"]);
  });
});
