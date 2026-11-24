"use client";
// Small helper to call our backend API from the browser (like services/api.js).
//
// The session token is NOT here. It lives in an HttpOnly cookie that the server
// sets and the browser sends automatically, so this module cannot read it - and
// neither can any script injected into the page.
//
// What is kept in localStorage is only the display profile (name, email, role).
// It is never used to decide access: the server re-checks on every request.

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  address: string | null;
  mustChangePassword?: boolean;
  createdAt?: string;
};

const USER_KEY = "egghub_user";

let memoryUser: User | null = null;

export function getSavedUser(): User | null {
  if (typeof window === "undefined") return null;
  if (memoryUser) return memoryUser;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const user = parsed as User;
    if (typeof user.id !== "number" || typeof user.email !== "string") return null;
    memoryUser = user;
    return user;
  } catch {
    return null;
  }
}

/** Cache the profile for rendering. Never a credential. */
export function saveUser(user: User) {
  memoryUser = user;
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // storage blocked - memory copy is enough for this page view
  }
  window.dispatchEvent(new Event("egghub-auth"));
}

/** Forget the cached profile AND expire the cookie server-side. */
export async function logout() {
  memoryUser = null;
  try {
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("egghub-auth"));
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    // the cookie will expire on its own; the local UI is already logged out
  }
}

// Generic request function. Throws an Error with the server message on failure.
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData; headers?: Record<string, string> } = {}
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers,
      credentials: "same-origin", // sends the HttpOnly session cookie
      body: options.formData ? options.formData : options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // the server could not be reached at all (offline, old preview link, ...)
    throw new Error("We could not reach the server. Please refresh the page and try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The hosting platform answers with its own error when the app is
    // restarting or an old preview link is used - explain it in plain words.
    if (data.sandboxId || response.status === 502 || response.status === 503) {
      throw new Error("The app is restarting or this page link has expired. Please open the latest link and try again.");
    }
    throw new Error(data.message || "Something went wrong.");
  }
  return data as T;
}

// Format a number as Rwandan Francs, e.g. 3500 -> "3,500 RWF"
export function rwf(amount: number) {
  return `${Number(amount || 0).toLocaleString()} RWF`;
}

// Format a date nicely
export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
}

// Turn "out_for_delivery" into "Out for Delivery"
export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    paid: "Paid",
    failed: "Failed",
    mobile_money: "Mobile Money",
    cash: "Cash on Delivery",
    card: "Card",
  };
  return labels[status] ?? status;
}
