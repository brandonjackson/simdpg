import { createErrorHandler } from "@simdpg/system-kit";

/**
 * Global error-handling middleware producing the DCI error envelope
 * `{ error: { code, message, details } }`. Registered last in index.ts.
 */
export const errorHandler = createErrorHandler("civil-registry");
