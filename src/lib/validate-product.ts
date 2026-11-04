// Shared validation for creating and editing products (used by admin routes)
import { tooLong, LIMITS } from "@/lib/validate";

const MAX_PRICE = 100_000_000; // 100M RWF — far above any egg package
const MAX_STOCK = 1_000_000;

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
  const nameErr = tooLong(name, LIMITS.productName, "Product name");
  if (nameErr) return { error: nameErr };
  const descErr = tooLong(description, LIMITS.description, "Description");
  if (descErr) return { error: descErr };
  const imgErr = tooLong(image, LIMITS.imageUrl, "Image URL");
  if (imgErr) return { error: imgErr };
  if (image && !/^(https?:\/\/|\/)/.test(image)) return { error: "Image must be an http(s) URL or a site path." };
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) return { error: "Price must be a positive number." };
  if (!Number.isInteger(packageSize) || packageSize <= 0 || packageSize > 100_000) return { error: "Package size must be a positive whole number." };
  if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) return { error: "Stock must be 0 or more." };
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) return { error: "Discount must be between 0 and 100." };

  return {
    data: { name, description, price: Math.round(price), packageSize, stock, discount: Math.round(discount), image, isAvailable },
  };
}
