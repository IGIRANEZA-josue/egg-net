// Validation for creating / editing promotions
export function readPromotionBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const type = String(body.type || "");
  const value = Number(body.value);
  const startDate = new Date(String(body.startDate || ""));
  // If only a date is given (YYYY-MM-DD), make the end date cover the whole day
  const endRaw = String(body.endDate || "");
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? new Date(endRaw + "T23:59:59") : new Date(endRaw);
  const active = body.active === undefined ? true : Boolean(body.active);

  if (!name) return { error: "Promotion name is required." };
  if (type !== "percentage" && type !== "fixed") return { error: "Type must be 'percentage' or 'fixed'." };
  if (!Number.isFinite(value) || value <= 0) return { error: "Value must be a positive number." };
  if (type === "percentage" && value > 100) return { error: "Percentage cannot be more than 100." };
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return { error: "Please provide valid start and end dates." };
  if (endDate < startDate) return { error: "End date must be after start date." };

  return { data: { name, type, value: Math.round(value), startDate, endDate, active } };
}
