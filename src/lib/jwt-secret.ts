// The secret used to sign login tokens.
//
// It comes from the JWT_SECRET environment variable and nowhere else.
//
// History: this module used to generate a secret, store it in plaintext in the
// `settings` table, and accept every historical value plus JWT_SECRET_FALLBACK
// forever. That meant a database dump handed an attacker the ability to mint
// valid admin tokens, and a rotation could never actually complete. Both are
// gone: one secret, one place, validated at startup.
//
// Rotation: set JWT_SECRET_PREVIOUS to the old secret while rolling out a new
// one, then delete it once every session has expired (24h). It is *not* an
// indefinite fallback - keeping it configured past that window defeats the
// rotation.

const MIN_LENGTH = 32;

// Values that appear in documentation, tutorials and this repo's own history.
// Persisting one of these as a signing key is worse than having no secret at all.
const KNOWN_PLACEHOLDERS = new Set([
  "change-me-to-a-long-random-string",
  "change-me",
  "changeme",
  "secret",
  "your-secret-key",
  "development-secret",
]);

let cachedCurrent: string | null = null;
let cachedPrevious: string | null | undefined;

function validate(name: string, value: string) {
  if (value.length < MIN_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_LENGTH} characters. Generate one with: openssl rand -hex 32`
    );
  }
  if (KNOWN_PLACEHOLDERS.has(value.toLowerCase())) {
    throw new Error(
      `${name} is set to a well-known placeholder value. Generate a real secret with: openssl rand -hex 32`
    );
  }
}

/** The secret new tokens are signed with. Throws if the environment is unusable. */
export function getSigningSecret(): string {
  if (cachedCurrent) return cachedCurrent;

  const value = process.env.JWT_SECRET?.trim();
  if (!value) {
    throw new Error(
      "JWT_SECRET is not set. Login tokens cannot be signed. Generate one with: openssl rand -hex 32 (see README > Environment variables)."
    );
  }
  validate("JWT_SECRET", value);
  cachedCurrent = value;
  return value;
}

/**
 * Secrets accepted when verifying an existing token.
 * Always exactly the current secret, plus JWT_SECRET_PREVIOUS only while a
 * rotation is in flight.
 */
export function getVerificationSecrets(): string[] {
  const current = getSigningSecret();

  if (cachedPrevious === undefined) {
    const previous = process.env.JWT_SECRET_PREVIOUS?.trim();
    if (previous) {
      validate("JWT_SECRET_PREVIOUS", previous);
      cachedPrevious = previous === current ? null : previous;
    } else {
      cachedPrevious = null;
    }
  }

  return cachedPrevious ? [current, cachedPrevious] : [current];
}

/** Test helper: forget cached values so a changed env is picked up. */
export function resetSecretCache() {
  cachedCurrent = null;
  cachedPrevious = undefined;
}
