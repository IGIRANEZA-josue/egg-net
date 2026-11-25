// Postgres error codes, unwrapped.
//
// Drizzle wraps driver errors in a DrizzleQueryError, so the `code` we care
// about lives on `error.cause` rather than on the object we catch. Checking only
// the top level silently turned every "duplicate email" into a 500.
type WithCode = { code?: unknown; cause?: unknown };

function codeOf(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== "object" || depth > 4) return null;
  const candidate = error as WithCode;
  if (typeof candidate.code === "string") return candidate.code;
  return codeOf(candidate.cause, depth + 1);
}

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";

export function isPgError(error: unknown, code: string): boolean {
  return codeOf(error) === code;
}
