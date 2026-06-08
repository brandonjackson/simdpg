/**
 * Helpers for consuming the systems' DCI API responses from the portal.
 *
 * List endpoints return the DCI envelope `{ data, meta }`; errors return
 * `{ error: { code, message, details } }`. These helpers tolerate both the
 * new envelopes and any legacy bare-array / string-error shapes.
 */

/** Extract the rows from a DCI list response (or a bare array). */
export function listData<T = unknown>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (
    json &&
    typeof json === "object" &&
    Array.isArray((json as { data?: unknown }).data)
  ) {
    return (json as { data: T[] }).data;
  }
  return [];
}

/** Extract a human-readable message from a DCI error envelope. */
export function errorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object") {
    const error = (json as { error?: unknown }).error;
    if (typeof error === "string" && error.length > 0) return error;
    if (
      error &&
      typeof error === "object" &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
  }
  return fallback;
}
