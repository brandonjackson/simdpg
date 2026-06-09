import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  ApiError,
  badRequest,
  notFound,
  conflict,
  unprocessable,
  createErrorHandler,
} from "./errors.js";

describe("error constructors", () => {
  it("carry the right status and code", () => {
    expect(badRequest("x")).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    expect(notFound("x")).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(conflict("x")).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(unprocessable("x")).toMatchObject({
      status: 422,
      code: "UNPROCESSABLE_ENTITY",
    });
  });

  it("preserve message and details", () => {
    const err = badRequest("nope", { field: "name" });
    expect(err.message).toBe("nope");
    expect(err.details).toEqual({ field: "name" });
    expect(err).toBeInstanceOf(ApiError);
  });
});

function mockRes() {
  const res = {} as Response & { body?: unknown; code?: number };
  res.status = vi.fn((c: number) => {
    res.code = c;
    return res;
  }) as never;
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  }) as never;
  return res;
}

describe("createErrorHandler", () => {
  const handler = createErrorHandler("test");
  const req = {} as Request;
  const next = vi.fn();

  it("renders ZodError as a 400 VALIDATION_ERROR with field details", () => {
    const res = mockRes();
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    handler((result as { error: unknown }).error, req, res, next);

    expect(res.code).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [{ path: "name", message: expect.any(String) }],
      },
    });
  });

  it("renders ApiError with its own status, code and details", () => {
    const res = mockRes();
    handler(conflict("dup", { id: 7 }), req, res, next);

    expect(res.code).toBe(409);
    expect(res.body).toEqual({
      error: { code: "CONFLICT", message: "dup", details: { id: 7 } },
    });
  });

  it("renders unknown errors as a 500 INTERNAL_ERROR", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockRes();
    handler(new Error("boom"), req, res, next);

    expect(res.code).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "boom", details: null },
    });
  });
});
