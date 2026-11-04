// The secret used to sign login tokens.
//
// Priority:
//   1. JWT_SECRET from the environment (recommended in production — rotate it
//      there and every instance picks it up)
//   2. a strong secret generated ONCE and stored in the database, so sessions
//      survive restarts/redeploys even when no env secret is configured
//
// Older secrets (DB rows jwt_secret_accept_*, JWT_SECRET_FALLBACK) are still
// accepted when verifying, so rotating the secret does not log everyone out.
import crypto from "crypto";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { like } from "drizzle-orm";

type Secrets = { sign: string; verify: string[] };

let cached: Promise<Secrets> | null = null;

async function load(): Promise<Secrets> {
  const rows = await db.select().from(settings).where(like(settings.key, "jwt_secret%"));

  // 1. Prefer the environment secret when configured.
  let sign = process.env.JWT_SECRET || "";

  // 2. Otherwise reuse (or create once) the database-stored secret.
  const stored = rows.find((r) => r.key === "jwt_secret")?.value;
  if (!sign) {
    sign = stored || crypto.randomBytes(32).toString("hex");
    if (!stored) {
      await db
        .insert(settings)
        .values({ key: "jwt_secret", value: sign })
        .onConflictDoNothing();
    }
  }

  // Secrets still accepted for verification (rotation grace period).
  const accepted = rows.filter((r) => r.key !== "jwt_secret").map((r) => r.value);
  const fromEnv = [process.env.JWT_SECRET_FALLBACK].filter(Boolean) as string[];
  const old = stored && stored !== sign ? [stored] : [];

  const verify = [sign, ...old, ...accepted, ...fromEnv].filter(
    (value, index, all) => all.indexOf(value) === index
  );
  return { sign, verify };
}

function secrets() {
  if (!cached) {
    cached = load().catch((err) => {
      cached = null; // don't cache failures (e.g. DB briefly unreachable)
      throw err;
    });
  }
  return cached;
}

// Secret used when creating a new token
export async function getSigningSecret() {
  return (await secrets()).sign;
}

// All secrets accepted when checking a token (current + old ones)
export async function getVerificationSecrets() {
  return (await secrets()).verify;
}

// Used by the setup script to accept sessions created with an older secret
export async function addAcceptedSecret(value: string) {
  await db.insert(settings).values({ key: `jwt_secret_accept_${Date.now()}`, value });
  cached = null;
}
