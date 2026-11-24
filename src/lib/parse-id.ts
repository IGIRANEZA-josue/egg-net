// Route params arrive as strings. `Number("abc")` is NaN, and NaN reaches
// PostgreSQL as `invalid input syntax for type integer` - an ugly 500 for what
// is really a 404. Every dynamic route uses this instead.
export function parseId(value: string | undefined | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}
