import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Per-request correlation id, echoed back as the `X-Request-ID` header. */
      requestId: string;
    }
  }
}

/**
 * Propagate an `X-Request-ID` for traceability. Honours an inbound header if
 * the caller (e.g. OpenFn) supplies one, otherwise mints a UUID. The id is
 * attached to `req.requestId` and echoed on the response.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("X-Request-ID");
  const id = incoming && incoming.trim().length > 0 ? incoming : uuidv4();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}
