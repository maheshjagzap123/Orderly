-- Orderly — order numbering starts at 1 per vendor
--
-- Previously businesses.order_seq defaulted to 100, and assign_order_number()
-- increments-then-returns, so the very first order for a vendor was #101.
-- Vendors expect numbering to start at #1. We set the default counter to 0 so
-- the first increment yields 1.
--
-- Safe for existing data: we only reset the counter for businesses that have
-- NOT yet assigned any order number. Any vendor already mid-sequence keeps its
-- current counter so their order numbers stay continuous and unique.

-- New vendors start their counter at 0 (first order becomes #1).
alter table businesses alter column order_seq set default 0;

-- Reset the counter to 0 for businesses that have never numbered an order yet.
update businesses b
set order_seq = 0
where not exists (
  select 1 from orders o
  where o.business_id = b.id
    and o.order_number is not null
);
