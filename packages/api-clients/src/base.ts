import type { ErrorResponse } from "./types.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ErrorResponse,
  ) {
    super(body.error?.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
  }

  /** Stable machine-readable error code from the DCI error envelope. */
  get code(): string {
    return this.body.error?.code ?? "UNKNOWN";
  }
}

export class BaseClient {
  constructor(protected baseUrl: string) {}

  protected async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({
        error: { code: "HTTP_ERROR", message: res.statusText },
      }))) as ErrorResponse;
      throw new ApiError(res.status, body);
    }

    return res.json() as Promise<T>;
  }

  protected get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  /**
   * GET a list endpoint, transparently unwrapping the DCI list envelope
   * (`{ data, meta }`). Falls back to a bare array for endpoints that have
   * not (yet) adopted pagination.
   */
  protected async getList<T>(path: string): Promise<T[]> {
    const body = await this.request<T[] | { data: T[] }>(path);
    if (Array.isArray(body)) return body;
    if (body && Array.isArray((body as { data?: T[] }).data)) {
      return (body as { data: T[] }).data;
    }
    return [];
  }

  protected post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  protected patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
}
