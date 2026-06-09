import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, BaseClient } from "./base.js";

// Expose the protected helpers for testing via a thin subclass.
class TestClient extends BaseClient {
  getJson<T>(path: string) {
    return this.get<T>(path);
  }
  getListJson<T>(path: string) {
    return this.getList<T>(path);
  }
  postJson<T>(path: string, body: unknown) {
    return this.post<T>(path, body);
  }
}

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: () => unknown;
}) {
  const fn = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? "OK",
    json: async () => (response.json ? response.json() : {}),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ApiError", () => {
  it("derives the message from the DCI error envelope", () => {
    const err = new ApiError(404, { error: { code: "NOT_FOUND", message: "nope" } });
    expect(err.message).toBe("nope");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
  });

  it("falls back to a status-based message and UNKNOWN code", () => {
    const err = new ApiError(500, {} as never);
    expect(err.message).toBe("Request failed with status 500");
    expect(err.code).toBe("UNKNOWN");
  });
});

describe("BaseClient.request", () => {
  it("prefixes the base URL and sets the JSON content-type", async () => {
    const fetchMock = mockFetch({ json: () => ({ id: 1 }) });
    const client = new TestClient("https://api.example/v1");

    const result = await client.getJson<{ id: number }>("/citizens/1");

    expect(result).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/v1/citizens/1");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("throws an ApiError carrying the response envelope on non-2xx", async () => {
    mockFetch({
      ok: false,
      status: 422,
      json: () => ({ error: { code: "UNPROCESSABLE_ENTITY", message: "bad" } }),
    });
    const client = new TestClient("https://api.example");

    await expect(client.getJson("/x")).rejects.toMatchObject({
      status: 422,
      code: "UNPROCESSABLE_ENTITY",
      message: "bad",
    });
  });

  it("synthesizes an HTTP_ERROR envelope when the error body is not JSON", async () => {
    const client = new TestClient("https://api.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(client.getJson("/x")).rejects.toMatchObject({
      status: 503,
      code: "HTTP_ERROR",
      message: "Service Unavailable",
    });
  });

  it("serializes the body and method for POST", async () => {
    const fetchMock = mockFetch({ json: () => ({ ok: true }) });
    const client = new TestClient("https://api.example");

    await client.postJson("/citizens", { name: "Ada" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Ada" }));
  });
});

describe("BaseClient.getList", () => {
  it("unwraps the DCI list envelope", async () => {
    mockFetch({ json: () => ({ data: [1, 2, 3], meta: { total: 3 } }) });
    const client = new TestClient("https://api.example");
    expect(await client.getListJson<number>("/items")).toEqual([1, 2, 3]);
  });

  it("passes through a bare array", async () => {
    mockFetch({ json: () => [4, 5] });
    const client = new TestClient("https://api.example");
    expect(await client.getListJson<number>("/items")).toEqual([4, 5]);
  });

  it("returns an empty array for an unrecognized shape", async () => {
    mockFetch({ json: () => ({ nope: true }) });
    const client = new TestClient("https://api.example");
    expect(await client.getListJson("/items")).toEqual([]);
  });
});
