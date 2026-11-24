-- Sequence-backed order numbers.
--
-- Before this migration the number was `"EGG" + Date.now().slice(-6)`: a
-- 1,000,000-value space that recycles every ~16.7 minutes, backed by a UNIQUE
-- constraint. Two orders in the same millisecond threw inside the transaction
-- and surfaced to the customer as "Failed to place order."
--
-- 1,000,000 orders/year is well beyond the shop's volume, so a plain sequence
-- is enough and cannot collide.
CREATE SEQUENCE IF NOT EXISTS order_number_seq AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

-- Format helper: EGG-YYYY-000123
CREATE OR REPLACE FUNCTION next_order_number() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('order_number_seq');
  RETURN 'EGG-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
END;
$$;
