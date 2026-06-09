import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { buildWebhookEvent, deliverWebhook } from "./webhooks.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.WEBHOOK_URL;
});

describe("buildWebhookEvent", () => {
  it("builds a DCI envelope with a uuid id and ISO timestamp", () => {
    const event = buildWebhookEvent("citizen.created", "identity", { id: 1 });
    expect(event).toMatchObject({
      type: "citizen.created",
      source: "identity",
      data: { id: 1 },
    });
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(new Date(event.time).toISOString()).toBe(event.time);
  });

  it("mints a unique id per call", () => {
    const a = buildWebhookEvent("t", "s", {});
    const b = buildWebhookEvent("t", "s", {});
    expect(a.id).not.toBe(b.id);
  });
});

describe("deliverWebhook", () => {
  const event = buildWebhookEvent("t", "identity", { ok: true });

  it("skips when WEBHOOK_URL is not configured", async () => {
    const result = await deliverWebhook(event);
    expect(result.status).toBe("skipped");
  });

  describe("with WEBHOOK_URL set", () => {
    beforeEach(() => {
      process.env.WEBHOOK_URL = "https://hooks.example/in";
    });

    it("POSTs the event and reports delivered on a 2xx", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: true, status: 202 });
      vi.stubGlobal("fetch", fetchMock);

      const result = await deliverWebhook(event);

      expect(result).toEqual({ status: "delivered", httpStatus: 202 });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://hooks.example/in");
      expect(init.method).toBe("POST");
      expect(init.headers["X-Request-ID"]).toBe(event.id);
      expect(JSON.parse(init.body).type).toBe("t");
    });

    it("reports failed with the status on a non-2xx", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      const result = await deliverWebhook(event);
      expect(result).toMatchObject({ status: "failed", httpStatus: 500 });
    });

    it("reports failed with the error message when fetch throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down")),
      );
      const result = await deliverWebhook(event);
      expect(result).toEqual({ status: "failed", error: "network down" });
    });
  });
});
