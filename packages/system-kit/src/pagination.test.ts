import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { getPagination, listResponse } from "./pagination.js";
import { ApiError } from "./errors.js";

const req = (query: Record<string, unknown>) => ({ query }) as unknown as Request;

describe("getPagination", () => {
  it("defaults to page 1, 20 per page", () => {
    expect(getPagination(req({}))).toEqual({
      page: 1,
      per_page: 20,
      offset: 0,
      limit: 20,
    });
  });

  it("parses page and per_page and derives offset/limit", () => {
    expect(getPagination(req({ page: "3", per_page: "25" }))).toEqual({
      page: 3,
      per_page: 25,
      offset: 50,
      limit: 25,
    });
  });

  it("clamps per_page to the 100 maximum", () => {
    expect(getPagination(req({ per_page: "500" })).per_page).toBe(100);
  });

  it("clamps per_page up to at least 1", () => {
    expect(getPagination(req({ per_page: "0" })).per_page).toBe(1);
  });

  it("rejects non-integer page values", () => {
    expect(() => getPagination(req({ page: "abc" }))).toThrow(ApiError);
    expect(() => getPagination(req({ per_page: "-1" }))).toThrow(/positive integer/);
  });
});

describe("listResponse", () => {
  it("wraps rows in the DCI list envelope", () => {
    const data = [{ id: 1 }, { id: 2 }];
    expect(listResponse(data, { page: 2, per_page: 20 }, 42)).toEqual({
      data,
      meta: { page: 2, per_page: 20, total: 42 },
    });
  });
});
