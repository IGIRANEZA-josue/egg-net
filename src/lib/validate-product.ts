// Shared validation for creating and editing products (used by admin routes)
export function readProductBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const price = Number(body.price);
  const packageSize = Number(body.packageSize);
  const stock = Number(body.stock);
  const discount = Number(body.discount || 0);
  const image = String(body.image || "").trim();
  const isAvailable = body.isAvailable === undefined ? true : Boolean(body.isAvailable);

  if (!name) return { error: "Product name is required." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Price must be a positive number." };
  if (!Number.isInteger(packageSize) || packageSize <= 0) return { error: "Package size must be a positive whole number." };
  if (!Number.isInteger(stock) || stock < 0) return { error: "Stock must be 0 or more." };
  if (discount < 0 || discount > 100) return { error: "Discount must be between 0 and 100." };

  return {
    data: { name, description, price: Math.round(price), packageSize, stock, discount: Math.round(discount), image, isAvailable },
  };
}
