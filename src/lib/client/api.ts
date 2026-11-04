"use client";
// Small helper to call our backend API from the browser (like services/api.js).
// Auth: the server sets an HttpOnly session cookie on login/register; we ALSO
// keep the token in localStorage (+ memory) and send it as a Bearer header, so
// login keeps working in embedded previews where cookies may be blocked.

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  address: string | null;
  createdAt?: string;
};

let memoryToken: string | null = null;
let memoryUser: User | null = null;

// Cached snapshot so useSyncExternalStore gets a stable reference.
let cachedUserRaw: string | null | undefined;
let cachedUser: User | null = null;

// These helpers never throw (storage can be blocked in private mode / iframes).
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage is blocked - the memory copy + server cookie still work
  }
}
function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return memoryToken || readStorage("egghub_token");
}

export function getSavedUser(): User | null {
  if (typeof window === "undefined") return null;
  if (memoryUser) return memoryUser;
  const raw = readStorage("egghub_user");
  if (raw !== cachedUserRaw) {
    cachedUserRaw = raw;
    try {
      cachedUser = raw ? (JSON.parse(raw) as User) : null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

export function saveAuth(token: string, user: User) {
  memoryUser = user;
  if (token) {
    memoryToken = token;
    writeStorage("egghub_token", token);
  }
  writeStorage("egghub_user", JSON.stringify(user));
  window.dispatchEvent(new Event("egghub-auth"));
}

export function clearAuth() {
  memoryToken = null;
  memoryUser = null;
  removeStorage("egghub_token");
  removeStorage("egghub_user");
  // Also clear the server's HttpOnly cookie (fire and forget).
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.dispatchEvent(new Event("egghub-auth"));
}

// Generic request function. Throws an Error with the server message on failure.
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.body) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers,
      credentials: "same-origin",
      body: options.formData ? options.formData : options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("We could not reach the server. Please refresh the page and try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 502 || response.status === 503) {
      throw new Error(data.message || "The server is temporarily unavailable. Please try again in a moment.");
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
  return labels[status] || status;
}
