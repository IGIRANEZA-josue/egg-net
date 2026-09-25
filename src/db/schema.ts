// Database tables for EggHub Rwanda.
// This is the equivalent of the Mongoose "models" folder, but for PostgreSQL.
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------- USERS (admin + customer) ----------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // always a bcrypt hash, never plain text
  phone: text("phone").default(""),
  role: text("role").notNull().default("customer"), // "admin" or "customer"
  address: text("address").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------- ORDERS ----------
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(), // e.g. EGG10025
  customerId: integer("customer_id").notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One row per product inside an order (prices are frozen at purchase time)
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  price: integer("price").notNull(), // price at time of purchase
  quantity: integer("quantity").notNull(),
});

// ---------- REVIEWS ----------
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  productId: integer("product_id").notNull(),
  orderId: integer("order_id").notNull(),
  rating: integer("rating").notNull(), // 1 - 5
  comment: text("comment").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- SETTINGS (single rows of app configuration) ----------
// Used to store the JWT signing secret so login sessions survive restarts.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ---------- PROMOTIONS (store-wide discounts) ----------
export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "percentage" or "fixed"
  value: integer("value").notNull(), // 10 (%) or 500 (RWF)
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
