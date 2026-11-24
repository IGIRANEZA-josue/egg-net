// Database tables for EggHub Rwanda.
// This is the equivalent of the Mongoose "models" folder, but for PostgreSQL.
import { relations } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- USERS (admin + customer) ----------
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(), // always a bcrypt hash, never plain text
    phone: text("phone").default(""),
    role: text("role").notNull().default("customer"), // "admin" or "customer"
    address: text("address").default(""),
    // true while an account still uses a seeded/demo password; the UI nags until it changes
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("users_role_idx").on(table.role)]
);

// ---------- PRODUCTS (egg packages) ----------
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").default(""),
    price: integer("price").notNull(), // price in RWF (whole numbers)
    packageSize: integer("package_size").notNull().default(30), // number of eggs
    stock: integer("stock").notNull().default(0),
    image: text("image").default(""),
    isAvailable: boolean("is_available").notNull().default(true),
    discount: integer("discount").notNull().default(0), // product-level % discount (0-100)
    // Soft delete: products with order history are hidden, never removed, so
    // invoices and reviews keep pointing at something real.
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("products_available_idx").on(table.isAvailable),
    index("products_created_at_idx").on(table.createdAt),
  ]
);

// ---------- ORDERS ----------
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    // e.g. EGG-2026-000001 (sequence-backed, see drizzle/ migration)
    orderNumber: text("order_number").notNull().unique(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    province: text("province").notNull(),
    district: text("district").notNull(),
    sector: text("sector").notNull(),
    address: text("address").notNull(),
    // How the customer gets the eggs: delivered inside the radius, or collected
    // at PICKUP. Stored per order because the rule can change over time.
    fulfilmentMethod: text("fulfilment_method").notNull().default("delivery"),
    // Where the customer actually was when ordering (null if they never shared it).
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    distanceKm: doublePrecision("distance_km"),
    instructions: text("instructions").default(""),
    subtotal: integer("subtotal").notNull(),
    deliveryFee: integer("delivery_fee").notNull(),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),
    paymentMethod: text("payment_method").notNull(), // mobile_money | cash | card
    paymentStatus: text("payment_status").notNull().default("pending"), // pending | paid | failed
    orderStatus: text("order_status").notNull().default("pending"), // pending | confirmed | preparing | out_for_delivery | delivered | cancelled
    // Replaying the same checkout (double click, retry) must not create a second order.
    idempotencyKey: text("idempotency_key").unique(),
    cancellationReason: text("cancellation_reason"),
    // Set when a paid order is cancelled: money must be returned by hand.
    refundRequired: boolean("refund_required").notNull().default(false),
    statusChangedBy: integer("status_changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    statusChangedAt: timestamp("status_changed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_order_status_idx").on(table.orderStatus),
    index("orders_payment_status_idx").on(table.paymentStatus),
    index("orders_created_at_idx").on(table.createdAt),
  ]
);

// One row per product inside an order (prices are frozen at purchase time)
export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    price: integer("price").notNull(), // price at time of purchase
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),
  ]
);

// ---------- REVIEWS ----------
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1 - 5
    comment: text("comment").default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // One review per product per order - enforced by the database, not just the route.
    uniqueIndex("reviews_order_product_customer_uidx").on(
      table.orderId,
      table.productId,
      table.customerId
    ),
    index("reviews_product_id_idx").on(table.productId),
  ]
);

// ---------- PROMOTIONS (store-wide or per-product discounts) ----------
export const promotions = pgTable(
  "promotions",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(), // "percentage" or "fixed"
    value: integer("value").notNull(), // 10 (%) or 500 (RWF)
    // null = store-wide. Set = applies to that one product only.
    productId: integer("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("promotions_active_idx").on(table.active),
    index("promotions_product_id_idx").on(table.productId),
  ]
);

// ---------- AUTH RATE LIMITS (brute-force protection) ----------
export const rateLimits = pgTable(
  "rate_limits",
  {
    // e.g. "login:1.2.3.4:user@example.com" or "register:1.2.3.4"
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [uniqueIndex("rate_limits_key_window_uidx").on(table.key, table.windowStart)]
);

// ---------- PASSWORD RESETS ----------
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Only the SHA-256 hash of the emailed token is stored.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("password_reset_tokens_user_id_idx").on(table.userId)]
);

// ---------- CONTACT MESSAGES ----------
export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  message: text("message").notNull(),
  handled: boolean("handled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- COUNTERS (sequence bookkeeping for order numbers) ----------
// Postgres sequences are created by the migration; this view-side table is not
// needed, so nothing is declared here on purpose.

// ------------------------------------------------------------------
// Relations (used by drizzle query helpers and tests)
// ------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  reviews: many(reviews),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(users, { fields: [orders.customerId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  orderItems: many(orderItems),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  customer: one(users, { fields: [reviews.customerId], references: [users.id] }),
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
}));

export const promotionsRelations = relations(promotions, ({ one }) => ({
  product: one(products, { fields: [promotions.productId], references: [products.id] }),
}));
