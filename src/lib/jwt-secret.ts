// The secret used to sign login tokens is stored in the DATABASE.
//
// Why not only .env? The hosting environment can recreate the .env file, and if
// JWT_SECRET disappears the app would sign and check tokens with a different
// secret -> every logged-in customer suddenly gets "Please login to continue."
// The database survives restarts, so sessions stay valid.
import crypto from "crypto";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { like } from "drizzle-orm";

type Secrets = { sign: string; verify: string[] };

let cached: Promise<Secrets> | null = null;

async function load(): Promise<Secrets> {
  const rows = await db.select().from(settings).where(like(settings.key, "jwt_secret%"));

  // 1. The main secret (created once, then reused forever)
  let sign = rows.find((r) => r.key === "jwt_secret")?.value;
  if (!sign) {
    sign = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
    await db.insert(settings).values({ key: "jwt_secret", value: sign });
  }

  // 2. Older secrets that are still accepted for checking (rows named
  //    jwt_secret_accept_1, jwt_secret_accept_2, ...) so nobody is logged out.
  const accepted = rows.filter((r) => r.key !== "jwt_secret").map((r) => r.value);

  // 3. Anything configured in the environment is accepted too.
  const fromEnv = [process.env.JWT_SECRET, process.env.JWT_SECRET_FALLBACK].filter(Boolean) as string[];

  const verify = [sign, ...accepted, ...fromEnv].filter((value, index, all) => all.indexOf(value) === index);
  return { sign, verify };
}

function secrets() {
  if (!cached) cached = load();
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
