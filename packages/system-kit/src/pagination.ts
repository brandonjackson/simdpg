import type { Request } from "express";
import { badRequest } from "./errors.js";

export interface Pagination {
  page: number;
  per_page: number;
  /** SQL OFFSET derived from page / per_page. */
  offset: number;
  /** SQL LIMIT (== per_page). */
  limit: number;
}

export interface ListMeta {
  page: number;
  per_page: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

function parsePositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw badRequest(`'${field}' must be a positive integer`);
  }
  return Number.parseInt(value, 10);
}

/**
 * Parse standard `?page=&per_page=` query params. `page` is 1-based.
 * Defaults to page 1, 20 per page; per_page is clamped to 100.
 */
export function getPagination(req: Request): Pagination {
  const page = parsePositiveInt(req.query.page, "page") ?? 1;
  const requested = parsePositiveInt(req.query.per_page, "per_page") ?? DEFAULT_PER_PAGE;

  const safePage = Math.max(1, page);
  const per_page = Math.min(Math.max(1, requested), MAX_PER_PAGE);

  return {
    page: safePage,
    per_page,
    offset: (safePage - 1) * per_page,
    limit: per_page,
  };
}

/**
 * Wrap a page of rows in the DCI list envelope:
 *   { data: [...], meta: { page, per_page, total } }
 */
export function listResponse<T>(
  data: T[],
  pagination: Pick<Pagination, "page" | "per_page">,
  total: number,
): ListResponse<T> {
  return {
    data,
    meta: { page: pagination.page, per_page: pagination.per_page, total },
  };
}
