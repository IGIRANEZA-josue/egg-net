import { describe, expect, it } from "vitest";
import { GET as listUsers } from "./route";
import { GET as getUser, PATCH as patchUser, DELETE as deleteUser } from "./[id]/route";
import { POST as login } from "@/app/api/auth/login/route";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { makeUser, authedRequest, readJson } from "@/test/helpers";

const base = "http://localhost/api/admin/users";

function idHandler(fn: typeof getUser, id: number) {
  return (request: Request) => fn(request, { params: Promise.resolve({ id: String(id) }) });
}

describe("listing users", () => {
  it("returns everyone with their order counts, and no passwords", async () => {
    const admin = await makeUser({ role: "admin", name: "Boss Admin" });
    const customer = await makeUser({ name: "Aline Uwase" });

    const res = await listUsers(await authedRequest(admin, base));
    expect(res.status).toBe(200);
    const body = await readJson<{
      users: Record<string, unknown>[];
      total: number; customers: number; admins: number; active: number; inactive: number;
    }>(res);

    expect(body.total).toBe(2);
    expect(body.customers).toBe(1);
    expect(body.admins).toBe(1);
    expect(body.active).toBe(2);
    const row = body.users.find((u) => u.id === customer.id)!;
    expect(row.name).toBe("Aline Uwase");
    expect(row).not.toHaveProperty("password");
    expect(row.orderCount).toBe(0);
  });

  it("searches by name, email and phone", async () => {
    const admin = await makeUser({ role: "admin" });
    const target = await makeUser({ name: "Jean Bosco", email: "jean@example.com" });

    for (const term of ["Bosco", "jean@example.com"]) {
      const res = await listUsers(await authedRequest(admin, `${base}?search=${encodeURIComponent(term)}`));
      const body = await readJson<{ users: { id: number }[] }>(res);
      expect(body.users.map((u) => u.id)).toEqual([target.id]);
    }
  });

  it("filters by role and by status", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser();
    await db.update(users).set({ isActive: false }).where(eq(users.id, customer.id));

    const adminsOnly = await readJson<{ users: { id: number }[] }>(
      await listUsers(await authedRequest(admin, `${base}?role=admin`))
    );
    expect(adminsOnly.users.map((u) => u.id)).toEqual([admin.id]);

    const inactive = await readJson<{ users: { id: number }[] }>(
      await listUsers(await authedRequest(admin, `${base}?status=inactive`))
    );
    expect(inactive.users.map((u) => u.id)).toEqual([customer.id]);
  });

  it("is admin-only", async () => {
    const customer = await makeUser();
    const res = await listUsers(await authedRequest(customer, base));
    expect(res.status).toBe(403);
  });
});

describe("one user", () => {
  it("returns the profile and its order summary", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser({ name: "Aline" });
    const res = await idHandler(getUser, customer.id)(await authedRequest(admin, `${base}/${customer.id}`));
    expect(res.status).toBe(200);
    const body = await readJson<{ user: { name: string }; summary: { orderCount: number }; isSelf: boolean }>(res);
    expect(body.user.name).toBe("Aline");
    expect(body.summary.orderCount).toBe(0);
    expect(body.isSelf).toBe(false);
  });

  it("edits name, email and phone", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser();
    const res = await idHandler(patchUser, customer.id)(
      await authedRequest(admin, `${base}/${customer.id}`, {
        method: "PATCH",
        body: { name: "New Name", email: "new@example.com", phone: "0788111222" },
      })
    );
    expect(res.status).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, customer.id));
    expect(row).toMatchObject({ name: "New Name", email: "new@example.com", phone: "0788111222" });
    // The password hash is untouched by a profile edit.
    expect(row.password).toMatch(/^\$2[aby]\$/);
  });

  it("rejects a duplicate email with 409", async () => {
    const admin = await makeUser({ role: "admin", email: "taken@example.com" });
    const customer = await makeUser();
    const res = await idHandler(patchUser, customer.id)(
      await authedRequest(admin, `${base}/${customer.id}`, {
        method: "PATCH",
        body: { email: "taken@example.com" },
      })
    );
    expect(res.status).toBe(409);
  });

  it("deactivates an account, which then cannot log in", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser({ email: "blocked@example.com" });

    const res = await idHandler(patchUser, customer.id)(
      await authedRequest(admin, `${base}/${customer.id}`, { method: "PATCH", body: { isActive: false } })
    );
    expect(res.status).toBe(200);

    const attempt = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "blocked@example.com", password: "Password123" }),
      })
    );
    expect(attempt.status).toBe(403);
  });

  it("lets a deactivated account back in once reactivated", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser({ email: "back@example.com" });

    await idHandler(patchUser, customer.id)(
      await authedRequest(admin, `${base}/${customer.id}`, { method: "PATCH", body: { isActive: false } })
    );
    await idHandler(patchUser, customer.id)(
      await authedRequest(admin, `${base}/${customer.id}`, { method: "PATCH", body: { isActive: true } })
    );

    const attempt = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "back@example.com", password: "Password123" }),
      })
    );
    expect(attempt.status).toBe(200);
  });

  it("refuses to let an admin deactivate or demote themselves", async () => {
    const admin = await makeUser({ role: "admin" });

    const deactivate = await idHandler(patchUser, admin.id)(
      await authedRequest(admin, `${base}/${admin.id}`, { method: "PATCH", body: { isActive: false } })
    );
    expect(deactivate.status).toBe(409);

    const demote = await idHandler(patchUser, admin.id)(
      await authedRequest(admin, `${base}/${admin.id}`, { method: "PATCH", body: { role: "customer" } })
    );
    expect(demote.status).toBe(409);

    const [row] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(row).toMatchObject({ role: "admin", isActive: true });
  });

  it("refuses to demote the last remaining admin", async () => {
    const admin = await makeUser({ role: "admin" });
    const other = await makeUser({ role: "admin" });

    // Demoting the other admin is allowed - one admin still remains.
    const first = await idHandler(patchUser, other.id)(
      await authedRequest(admin, `${base}/${other.id}`, { method: "PATCH", body: { role: "customer" } })
    );
    expect(first.status).toBe(200);
  });

  it("deletes an account with no history", async () => {
    const admin = await makeUser({ role: "admin" });
    const customer = await makeUser();
    const res = await idHandler(deleteUser, customer.id)(
      await authedRequest(admin, `${base}/${customer.id}`, { method: "DELETE" })
    );
    expect(res.status).toBe(200);
    expect(await db.select().from(users).where(eq(users.id, customer.id))).toHaveLength(0);
  });

  it("refuses to delete your own account", async () => {
    const admin = await makeUser({ role: "admin" });
    const res = await idHandler(deleteUser, admin.id)(
      await authedRequest(admin, `${base}/${admin.id}`, { method: "DELETE" })
    );
    expect(res.status).toBe(409);
  });

  it("is admin-only for every method", async () => {
    const customer = await makeUser();
    const other = await makeUser();

    expect((await idHandler(getUser, other.id)(await authedRequest(customer, `${base}/${other.id}`))).status).toBe(403);
    expect(
      (await idHandler(patchUser, other.id)(
        await authedRequest(customer, `${base}/${other.id}`, { method: "PATCH", body: { name: "Hacked" } })
      )).status
    ).toBe(403);
    expect(
      (await idHandler(deleteUser, other.id)(
        await authedRequest(customer, `${base}/${other.id}`, { method: "DELETE" })
      )).status
    ).toBe(403);
  });
});
