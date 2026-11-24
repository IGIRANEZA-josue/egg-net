-- WHERE AN ORDER IS FULFILLED.
--
-- Delivery used to be unconditional and the delivery fee was always added. Now
-- an order is either delivered (the customer is inside the delivery radius,
-- measured from EPR Karugira) or collected by the customer at EPR Karugira.
-- Pickup orders pay a small handling fee instead of the delivery fee.
--
-- The decision is made in src/lib/fulfilment.ts, and the coordinates it was made
-- from are kept here so an operator can see exactly why a customer was told to
-- come and collect.
--
-- Existing rows: the rule did not exist when they were placed, so they keep
-- 'delivery' and their original delivery fee. No backfill and no re-pricing.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "fulfilment_method" text NOT NULL DEFAULT 'delivery';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "latitude" double precision;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "longitude" double precision;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "distance_km" double precision;

-- The admin order list and the customer's own list both read this column.
CREATE INDEX IF NOT EXISTS "orders_fulfilment_method_idx"
  ON "orders" ("fulfilment_method");

-- Only two values are valid; anything else is a bug, not a typo.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_fulfilment_method_check";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_fulfilment_method_check"
  CHECK ("fulfilment_method" IN ('delivery', 'pickup'));
