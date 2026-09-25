"use client";
// Small helper to call our backend API from the browser (like services/api.js).
// It automatically adds the JWT token saved in localStorage.

export type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  address: string | null;
  createdAt?: string;
};

// ------------------------------------------------------------------
// Session storage. The login is kept in THREE places and every one of them
// is optional: browser storage can be blocked or throw errors (private mode,
// embedded previews). When that happens the login must still work.
// ------------------------------------------------------------------
let memoryToken: string | null = null;
let memoryUser: User | null = null;

// These helpers never throw.
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
    // storage is blocked - the memory + cookie copies still work
  }
}
function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
function writeCookie(name: string, value: string) {
  try {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=604800";
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=604800; samesite=none; secure";
  } catch {
    // ignore
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return memoryToken || readStorage("egghub_token") || readCookie("egghub_token");
}

export function getSavedUser(): User | null {
  if (typeof window === "undefined") return null;
  if (memoryUser) return memoryUser;
  const raw = readStorage("egghub_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function saveAuth(token: string, user: User) {
  memoryUser = user;
  if (token) {
    memoryToken = token;
    writeStorage("egghub_token", token);
    writeCookie("egghub_token", token);
  }
  writeStorage("egghub_user", JSON.stringify(user));
  window.dispatchEvent(new Event("egghub-auth"));
}

export function clearAuth() {
  memoryToken = null;
  memoryUser = null;
  removeStorage("egghub_token");
  removeStorage("egghub_user");
  writeCookie("egghub_token", "");
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
    headers["x-egghub-token"] = token; // backup, in case the first header is lost
  }
  if (options.body) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers,
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
  return labels[status] || status;
}
