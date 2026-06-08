import type { Request, Response, NextFunction, RequestHandler } from "express";

/** Wrap an async route handler so thrown/rejected errors reach next(). */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** owner_id of the single disbursing treasury account. */
export const TREASURY_OWNER_ID = "treasury";
