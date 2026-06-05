import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const messages = err.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`,
    );
    res.status(400).json({ error: messages.join("; ") });
    return;
  }

  if (err instanceof Error) {
    console.error("[error]", err.stack ?? err.message);
    res.status(500).json({ error: err.message });
    return;
  }

  console.error("[error] Unknown error:", err);
  res.status(500).json({ error: "Internal server error" });
}
