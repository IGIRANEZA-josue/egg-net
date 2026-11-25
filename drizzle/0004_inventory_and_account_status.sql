-- INVENTORY MOVEMENTS AND ACCOUNT STATUS.
--
-- Two things the platform could not express before:
--
--   1. Egg stock had no history. `products.stock` was a number that went up and
--      down with no record of why - an order decremented it and a cancellation
--      put it back, but deliveries from the farm, breakage and manual
--      corrections left no trace at all.
--
--   2. An account was either present or deleted. There was no way to suspend a
--      customer without destroying their order history.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;

-- Eggs are grouped by kind (chicken / duck / quail ...). One default keeps
-- every existing listing valid; no rows are rewritten.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'Chicken eggs';

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" serial PRIMARY KEY NOT NULL,
  -- 'in' = received into inventory, 'out' = left it (sold, spoiled, lost ...)
  "direction" text NOT NULL,
  "product_id" integer NOT NULL,
  "quantity" integer NOT NULL,
  -- Human-readable why: "Farm delivery", "Customer order EGG-2026-000001" ...
  "reason" text NOT NULL DEFAULT '',
  -- Where it came from / went to (supplier, customer, cold room ...).
  "source" text NOT NULL DEFAULT '',
  "note" text DEFAULT '',
  -- Set when the movement was produced by an order, so the ledger and the order
  -- history can be reconciled.
  "order_id" integer,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- A movement is one direction, a positive count, and nothing else.
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_direction_check";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_direction_check"
  CHECK ("direction" IN ('in', 'out'));
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_quantity_check";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_check"
  CHECK ("quantity" > 0);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_product_id_idx" ON "stock_movements" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_created_at_idx" ON "stock_movements" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_direction_idx" ON "stock_movements" ("direction");
