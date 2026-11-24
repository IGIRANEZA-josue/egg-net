"use client";
// Safe localStorage reads.
//
// `JSON.parse(localStorage.getItem(...))` with no guard is a sitewide crash:
// one malformed value - a truncated write, an object where an array belongs, a
// schema change - throws inside a component effect, and every page breaks.
// These helpers never throw and self-heal by clearing the bad key.

export function safeRead<T>(key: string, validate: (value: unknown) => T | null): T | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const valid = validate(parsed);
    if (valid === null) window.localStorage.removeItem(key);
    return valid;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}

export function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked or full - the in-memory state still works for this view
  }
}

export function safeRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
