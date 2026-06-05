import type { ErrorResponse } from "./types.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ErrorResponse,
  ) {
    super(body.error);
    this.name = "ApiError";
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
        error: res.statusText,
      }))) as ErrorResponse;
      throw new ApiError(res.status, body);
    }

    return res.json() as Promise<T>;
  }

  protected get<T>(path: string): Promise<T> {
    return this.request<T>(path);
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
