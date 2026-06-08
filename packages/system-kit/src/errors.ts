import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/**
 * DCI-style error envelope returned by every system:
 *
 *   { "error": { "code": string, "message": string, "details": unknown } }
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Throwable application error carrying an HTTP status and a stable machine
 * code. Routes throw these (or let them bubble through `next(err)`) and the
 * shared {@link errorHandler} renders the DCI error envelope.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Convenience constructors for the common cases ----------------------------

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);

export const notFound = (message: string, details?: unknown) =>
  new ApiError(404, "NOT_FOUND", message, details);

export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, "CONFLICT", message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new ApiError(422, "UNPROCESSABLE_ENTITY", message, details);

/**
 * Build a global Express error handler that always responds with the DCI
 * error envelope. `system` is used only for log lines.
 *
 * Must be registered last, after all routes.
 */
export function createErrorHandler(system: string) {
  return function errorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    // Zod validation errors -> 400 with field-level details
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        },
      } satisfies ErrorEnvelope);
      return;
    }

    // Application errors carry their own status / code
    if (err instanceof ApiError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details ?? null,
        },
      } satisfies ErrorEnvelope);
      return;
    }

    // Anything else is an unexpected 500
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error(`[${system}] Unhandled error:`, err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message, details: null },
    } satisfies ErrorEnvelope);
  };
}
