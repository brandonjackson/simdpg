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

/** Serves a paginated list endpoint, one page per `?page=` value. */
function mockPaginatedFetch(pages: Record<number, unknown[]>, total: number) {
  const fn = vi.fn().mockImplementation(async (url: string) => {
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: pages[page] ?? [],
        meta: { page, per_page: 100, total },
      }),
    };
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

  it("follows pagination until the full collection is fetched", async () => {
    const fetchMock = mockPaginatedFetch(
      { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8] },
      8,
    );
    const client = new TestClient("https://api.example");

    expect(await client.getListJson<number>("/items")).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const requestedPages = fetchMock.mock.calls.map(([u]) =>
      new URL(u as string).searchParams.get("page"),
    );
    expect(requestedPages).toEqual(["1", "2", "3"]);
  });

  it("requests the maximum page size", async () => {
    const fetchMock = mockFetch({ json: () => ({ data: [1], meta: { total: 1 } }) });
    const client = new TestClient("https://api.example");

    await client.getListJson("/items");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("per_page")).toBe("100");
  });

  it("appends pagination params after an existing query string", async () => {
    const fetchMock = mockFetch({ json: () => ({ data: [], meta: { total: 0 } }) });
    const client = new TestClient("https://api.example");

    await client.getListJson("/items?q=x");

    expect(fetchMock.mock.calls[0][0]).toContain(
      "/items?q=x&page=1&per_page=100",
    );
  });

  it("stops if a page returns no rows even when total is unmet", async () => {
    // Guards against an infinite loop if the server's total is inconsistent.
    const fetchMock = mockPaginatedFetch({ 1: [1, 2], 2: [] }, 99);
    const client = new TestClient("https://api.example");

    expect(await client.getListJson<number>("/items")).toEqual([1, 2]);
    expect(fetchMock.mock.calls.length).toBe(2);
  });
});
