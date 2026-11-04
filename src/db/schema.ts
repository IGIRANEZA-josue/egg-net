// Database tables for EggHub Rwanda (Drizzle ORM = the "models" folder).
import {
  pgTable,
  pgSequence,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// Binary column type for storing uploaded images directly in PostgreSQL.
// (Local-disk uploads do not work on serverless hosts like Vercel.)
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Monotonic order numbers (EGG10001, EGG10002, ...). A sequence never collides,
// unlike the old Date.now()-based numbers which could clash under load.
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 10001 });

// ---------- USERS (admin + customer) ----------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // always a bcrypt hash, never plain text
  phone: text("phone").default(""),
  role: text("role").notNull().default("customer"), // "admin" or "customer"
  address: text("address").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- PRODUCTS (egg packages) ----------
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  price: integer("price").notNull(), // price in RWF (whole numbers)
  packageSize: integer("package_size").notNull().default(30), // number of eggs
  stock: integer("stock").notNull().default(0),
  image: text("image").default(""),
  isAvailable: boolean("is_available").notNull().default(true),
  discount: integer("discount").notNull().default(0), // product-level % discount (0-100)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- ORDERS ----------
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(), // e.g. EGG10025
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    province: text("province").notNull(),
    district: text("district").notNull(),
    sector: text("sector").notNull(),
    address: text("address").notNull(),
    instructions: text("instructions").default(""),
    subtotal: integer("subtotal").notNull(),
    deliveryFee: integer("delivery_fee").notNull(),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),
    paymentMethod: text("payment_method").notNull(), // mobile_money | cash | card
    paymentStatus: text("payment_status").notNull().default("pending"), // pending | paid | failed
    orderStatus: text("order_status").notNull().default("pending"), // pending | confirmed | preparing | out_for_delivery | delivered | cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("orders_customer_idx").on(t.customerId), index("orders_status_idx").on(t.orderStatus)]
);

// One row per product inside an order. Prices/names are frozen at purchase
// time, so productId is a historical reference (no FK: admins may delete a
// product later without destroying order history).
export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull(),
    productName: text("product_name").notNull(),
    price: integer("price").notNull(), // price at time of purchase
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)]
);

// ---------- REVIEWS ----------
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerName: text("customer_name").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1 - 5
    comment: text("comment").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("reviews_product_idx").on(t.productId),
    // One review per product per order, enforced by the database itself.
    uniqueIndex("reviews_order_product_customer_uniq").on(t.orderId, t.productId, t.customerId),
  ]
);

// ---------- SETTINGS (single rows of app configuration) ----------
// Stores the generated JWT signing secret when JWT_SECRET is not set in the
// environment, so login sessions survive restarts and redeploys.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---------- IMAGES (admin product uploads, stored in the database) ----------
// Works on serverless hosts (Vercel) where the filesystem is read-only.
// Served by GET /api/images/:id with long-lived cache headers.
export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- PROMOTIONS (store-wide discounts) ----------
export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "percentage" or "fixed"
  value: integer("value").notNull(), // 10 (%) or 500 (RWF)
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
