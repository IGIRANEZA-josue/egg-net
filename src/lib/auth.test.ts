import { describe, expect, it, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createToken,
  getTokenFromRequest,
  getUserFromRequest,
  requireAdmin,
  requireUser,
  hashPassword,
  comparePassword,
  AUTH_COOKIE,
} from "@/lib/auth";
import { getSigningSecret, resetSecretCache, getVerificationSecrets } from "@/lib/jwt-secret";
import { makeUser } from "@/test/helpers";

function requestWithCookie(token: string) {
  return new Request("http://localhost/api/whatever", { headers: { cookie: `${AUTH_COOKIE}=${token}` } });
}

describe("JWT secret handling", () => {
  beforeEach(() => resetSecretCache());

  it("uses JWT_SECRET from the environment", () => {
    expect(getSigningSecret()).toBe(process.env.JWT_SECRET);
  });

  it("refuses a missing secret", () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    resetSecretCache();
    expect(() => getSigningSecret()).toThrow(/JWT_SECRET is not set/);
    process.env.JWT_SECRET = original;
    resetSecretCache();
  });

  it("refuses the placeholder that shipped in .env.example", () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "change-me-to-a-long-random-string";
    resetSecretCache();
    expect(() => getSigningSecret()).toThrow(/placeholder/);
    process.env.JWT_SECRET = original;
    resetSecretCache();
  });

  it("accepts exactly one secret when no rotation is configured", () => {
    delete process.env.JWT_SECRET_PREVIOUS;
    resetSecretCache();
    expect(getVerificationSecrets()).toHaveLength(1);
  });
});

describe("token extraction", () => {
  it("reads the HttpOnly cookie", () => {
    expect(getTokenFromRequest(requestWithCookie("abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("still accepts a Bearer header for API clients", () => {
    const request = new Request("http://localhost", { headers: { authorization: "Bearer xyz" } });
    expect(getTokenFromRequest(request)).toBe("xyz");
  });

  it("no longer accepts the old custom header", () => {
    const request = new Request("http://localhost", { headers: { "x-egghub-token": "legacy" } });
    expect(getTokenFromRequest(request)).toBeNull();
  });

  it("returns null with no credentials", () => {
    expect(getTokenFromRequest(new Request("http://localhost"))).toBeNull();
  });
});

describe("authorization", () => {
  it("requireUser returns 401 without a token", async () => {
    const result = await requireUser(new Request("http://localhost"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("requireUser returns 401 for a garbage token", async () => {
    const result = await requireUser(requestWithCookie("not.a.token"));
    expect((result as NextResponse).status).toBe(401);
  });

  it("rejects a token signed with an unknown secret", async () => {
    const user = await makeUser({ role: "customer" });
    const forged = jwt.sign({ id: user.id, role: "admin" }, "some-other-secret-that-is-long-enough-here", {
      issuer: "egghub",
      audience: "egghub-web",
    });
    const result = await requireUser(requestWithCookie(forged));
    expect((result as NextResponse).status).toBe(401);
  });

  it("does not trust the role claim in the token", async () => {
    const customer = await makeUser({ role: "customer" });
    // Hand-forge an admin claim with the real secret - the database still says customer.
    const token = jwt.sign({ id: customer.id, role: "admin" }, getSigningSecret(), {
      expiresIn: "1h",
      issuer: "egghub",
      audience: "egghub-web",
    });
    const result = await requireAdmin(requestWithCookie(token));
    expect((result as NextResponse).status).toBe(403);
  });

  it("requireAdmin returns 403 for a valid customer", async () => {
    const customer = await makeUser({ role: "customer" });
    const token = await createToken(customer.id, customer.role);
    const result = await requireAdmin(requestWithCookie(token));
    expect((result as NextResponse).status).toBe(403);
  });

  it("requireAdmin returns the admin for a valid admin", async () => {
    const admin = await makeUser({ role: "admin" });
    const token = await createToken(admin.id, admin.role);
    const result = await requireAdmin(requestWithCookie(token));
    expect(result).toMatchObject({ id: admin.id, role: "admin" });
  });

  it("resolves the user from the cookie alone", async () => {
    const user = await makeUser();
    const token = await createToken(user.id, user.role);
    const resolved = await getUserFromRequest(requestWithCookie(token));
    expect(resolved?.email).toBe(user.email);
  });
});

describe("password hashing", () => {
  it("hashes with a cost of at least 12 and verifies", async () => {
    const hash = await hashPassword("Password123");
    // $2b$12$... - the cost is the second field.
    expect(hash.split("$")[2]).toBe("12");
    expect(await comparePassword("Password123", hash)).toBe(true);
    expect(await comparePassword("wrong", hash)).toBe(false);
  });

  it("never stores the plain password", async () => {
    const user = await makeUser();
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.password).not.toContain("Password123");
    expect(row.password.startsWith("$2")).toBe(true);
  });
});
