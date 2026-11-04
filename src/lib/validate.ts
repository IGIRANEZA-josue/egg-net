// Shared input validation helpers. Every API route validates on the SERVER —
// the browser checks are only for a nicer user experience.

// Rwandan phone numbers: 07XXXXXXXX, +2507XXXXXXXX, 2507XXXXXXXX (spaces/dashes ok).
// Kept deliberately loose so foreign numbers with a country code also pass.
const RW_PHONE = /^(?:\+?250|0)?7[2389]\d{7}$/;
const INTL_PHONE = /^\+?[0-9]{9,15}$/;

export function cleanPhone(value: unknown): string {
  return String(value ?? "").replace(/[\s\-()]/g, "");
}

export function isValidPhone(value: unknown): boolean {
  const p = cleanPhone(value);
  return RW_PHONE.test(p) || INTL_PHONE.test(p);
}

export function isValidEmail(value: unknown): boolean {
  const email = String(value ?? "").trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Returns an error message when the text is longer than max, else null.
export function tooLong(value: unknown, max: number, label: string): string | null {
  return String(value ?? "").length > max ? `${label} is too long (max ${max} characters).` : null;
}

// Common length caps used across routes.
export const LIMITS = {
  name: 120,
  email: 254,
  password: 128, // bcrypt only uses the first 72 bytes; cap to avoid abuse
  phone: 20,
  address: 300,
  instructions: 500,
  description: 2000,
  comment: 1000,
  productName: 160,
  imageUrl: 500,
  place: 120, // province / district / sector
} as const;

// Parse a positive integer route param (/api/products/:id). Returns null when invalid.
export function parseId(value: string | number | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
