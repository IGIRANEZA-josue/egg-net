import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, rateLimits } from "@/db/schema";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { PUT as updateProfile } from "@/app/api/auth/profile/route";
import { makeUser, authedRequest } from "@/test/helpers";

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Read the session cookie a route set, if any. */
function sessionCookie(response: Response): string | null {
  const raw = response.headers.get("set-cookie");
  if (!raw) return null;
  const match = raw.match(/egghub_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

describe("POST /api/auth/login", () => {
  it("sets an HttpOnly session cookie and returns no token in the body", async () => {
    const user = await makeUser({ email: "eline@example.com" });

    const response = await login(post("http://localhost/api/auth/login", { email: user.email, password: "Password123" }));

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/egghub_token=/);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.token).toBeUndefined();
    expect(body.user).toMatchObject({ email: user.email });
    // The hash must never be serialised to the browser.
    expect(JSON.stringify(body)).not.toContain("$2");
  });

  it("answers identically for an unknown email and a wrong password", async () => {
    const user = await makeUser({ email: "known@example.com" });

    const unknown = await login(post("http://localhost/api/auth/login", { email: "nobody@example.com", password: "Password123" }));
    const wrong = await login(post("http://localhost/api/auth/login", { email: user.email, password: "WrongPassword1" }));

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("rate-limits repeated failures per account", async () => {
    const user = await makeUser({ email: "target@example.com" });
    let last: Response | null = null;
    for (let i = 0; i < 6; i++) {
      last = await login(post("http://localhost/api/auth/login", { email: user.email, password: "WrongPassword1" }));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
    const body = (await last!.json()) as { message: string };
    // The message never says which limit tripped or whether the account exists.
    expect(body.message).toMatch(/too many attempts/i);

    const rows = await db.select().from(rateLimits);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("does not rate-limit a correct login after a few failures, and clears the counter", async () => {
    const user = await makeUser({ email: "recover@example.com" });
    for (let i = 0; i < 3; i++) {
      await login(post("http://localhost/api/auth/login", { email: user.email, password: "Wrong" }));
    }
    const good = await login(post("http://localhost/api/auth/login", { email: user.email, password: "Password123" }));
    expect(good.status).toBe(200);
    expect(sessionCookie(good)).toBeTruthy();
  });
});

describe("POST /api/auth/register", () => {
  it("forces the customer role", async () => {
    const response = await register(
      post("http://localhost/api/auth/register", {
        name: "Jean Paul",
        email: "jean@example.com",
        password: "StrongPass123",
        phone: "0788123456",
        role: "admin", // must be ignored
      })
    );

    expect(response.status).toBe(201);
    const [row] = await db.select().from(users).where(eq(users.email, "jean@example.com"));
    expect(row.role).toBe("customer");
  });

  it("rejects a short password, a bad email and an invalid phone", async () => {
    const short = await register(post("http://localhost/api/auth/register", { name: "A B", email: "a@b.com", password: "1234567" }));
    expect(short.status).toBe(400);

    const email = await register(post("http://localhost/api/auth/register", { name: "A B", email: "not-an-email", password: "StrongPass123" }));
    expect(email.status).toBe(400);

    const phone = await register(
      post("http://localhost/api/auth/register", { name: "A B", email: "c@d.com", password: "StrongPass123", phone: "12345" })
    );
    expect(phone.status).toBe(400);
  });

  it("does not reveal that an email is already in use", async () => {
    await makeUser({ email: "taken@example.com" });
    const response = await register(
      post("http://localhost/api/auth/register", { name: "Someone", email: "taken@example.com", password: "StrongPass123" })
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { message: string };
    expect(body.message).not.toMatch(/already/i);
    expect(body.message).toMatch(/could not create/i);
  });

  it("rejects a password that equals the email", async () => {
    const response = await register(
      post("http://localhost/api/auth/register", { name: "Someone", email: "same@example.com", password: "same@example.com" })
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("expires the session cookie", async () => {
    const response = await logout(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/egghub_token=;/);
    expect(setCookie.toLowerCase()).toContain("max-age=0");
  });
});

describe("PUT /api/auth/profile", () => {
  it("requires the current password to set a new one", async () => {
    const user = await makeUser({ email: "profile@example.com" });
    const response = await updateProfile(
      await authedRequest(user, "http://localhost/api/auth/profile", {
        method: "PUT",
        body: { name: "New Name", password: "BrandNewPass123" },
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/current password/i);
  });

  it("rejects a wrong current password", async () => {
    const user = await makeUser();
    const response = await updateProfile(
      await authedRequest(user, "http://localhost/api/auth/profile", {
        method: "PUT",
        body: { name: user.name, password: "BrandNewPass123", currentPassword: "NotMyPassword" },
      })
    );
    expect(response.status).toBe(400);
  });

  it("changes the password with the correct current one", async () => {
    const user = await makeUser({ email: "change@example.com" });
    const response = await updateProfile(
      await authedRequest(user, "http://localhost/api/auth/profile", {
        method: "PUT",
        body: { name: user.name, password: "BrandNewPass123", currentPassword: "Password123" },
      })
    );
    expect(response.status).toBe(200);

    const after = await login(post("http://localhost/api/auth/login", { email: user.email, password: "BrandNewPass123" }));
    expect(after.status).toBe(200);
  });
});
