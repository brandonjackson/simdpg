import type {
  ErrorResponse,
  WebhookSubscription,
  CreateWebhookSubscriptionInput,
} from "./types.js";

/** Server-side max page size (see system-kit pagination); fewest round-trips. */
const PAGE_SIZE = 100;

/** Append `page`/`per_page` params, respecting any existing query string. */
function pageUrl(path: string, page: number): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}page=${page}&per_page=${PAGE_SIZE}`;
}

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

/**
 * `RequestInit` as typed by @types/node (undici) omits the standard `cache`
 * field, so name it here rather than pulling the whole DOM lib in. Node accepts
 * and ignores it; Next.js reads it (see the note in {@link BaseClient.request}).
 */
type FetchInit = RequestInit & { cache?: "no-store" };

export class BaseClient {
  constructor(protected baseUrl: string) {}

  protected async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: FetchInit = {
      // Every system read is live, mutable state. Next.js patches `fetch` in
      // server components and route handlers and, when no cache option is
      // given, stores GET responses in its Data Cache with `revalidate: false`
      // — i.e. for a year — so the portal would serve counts and records from
      // whenever the container first rendered the page. `dynamic =
      // "force-dynamic"` does not cover this: it forces dynamic *rendering*
      // but leaves `fetchCache` alone. Opt out here so no caller can inherit a
      // stale read by forgetting to.
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };
    const res = await fetch(url, init);

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
   * GET a list endpoint and return the COMPLETE collection, transparently
   * unwrapping the DCI list envelope (`{ data, meta }`) and following
   * pagination across every page. Every caller of this helper wants the whole
   * list (not a single page — the frontend paginates its own views directly),
   * so we drain `meta.total` rather than silently returning only page 1.
   * Falls back to a bare array for endpoints that never adopted the envelope.
   */
  protected async getList<T>(path: string): Promise<T[]> {
    const first = await this.request<
      T[] | { data: T[]; meta?: { total?: number } }
    >(pageUrl(path, 1));
    if (Array.isArray(first)) return first; // bare array: nothing to paginate
    if (!first || !Array.isArray(first.data)) return [];

    const rows = [...first.data];
    const total = first.meta?.total;
    if (typeof total !== "number") return rows;

    for (let page = 2; rows.length < total; page++) {
      const next = await this.request<{ data?: T[] }>(pageUrl(path, page));
      const data = next?.data;
      // Empty/short page: stop rather than loop forever on an inconsistent total.
      if (!Array.isArray(data) || data.length === 0) break;
      rows.push(...data);
    }
    return rows;
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

  // -- Webhook subscriptions (shared admin endpoints on every system) --------

  /**
   * List per-event webhook subscriptions registered on this system. Pass a
   * project id to list only that project's registrations.
   */
  listWebhookSubscriptions(projectId?: string): Promise<WebhookSubscription[]> {
    const path = projectId
      ? `/admin/webhook-subscriptions?project_id=${encodeURIComponent(projectId)}`
      : "/admin/webhook-subscriptions";
    return this.getList<WebhookSubscription>(path);
  }

  /** Register a new webhook target for an event type. */
  createWebhookSubscription(
    input: CreateWebhookSubscriptionInput,
  ): Promise<WebhookSubscription> {
    return this.post<WebhookSubscription>("/admin/webhook-subscriptions", input);
  }

  /** Remove a webhook subscription by id. */
  deleteWebhookSubscription(id: string): Promise<void> {
    return this.request<void>(`/admin/webhook-subscriptions/${id}`, {
      method: "DELETE",
    });
  }
}
