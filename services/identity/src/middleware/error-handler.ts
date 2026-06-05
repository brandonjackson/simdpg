import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/**
 * Global error-handling middleware.
 * Must have all four parameters so Express recognises it as an error handler.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors -> 400
  if (err instanceof ZodError) {
    const message = err.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    res.status(400).json({ error: message });
    return;
  }

  // Generic Error
  if (err instanceof Error) {
    console.error("[identity] Unhandled error:", err.message);
    res.status(500).json({ error: err.message });
    return;
  }

  // Unknown shape
  console.error("[identity] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
