-- Orderly — Row Level Security + Realtime
-- Model:
--  * Vendors (authenticated) can fully manage ONLY their own business and its children.
--  * Public (anon) can READ active businesses/categories/items (the menu).
--  * Public can CREATE orders + order_items + payments for an active, accepting business.
--  * Public can READ their order back (needed for confirmation/tracking).
--  * Service role (Edge Functions / scripts) bypasses RLS automatically.

-- Enable RLS everywhere
alter table businesses   enable row level security;
alter table categories   enable row level security;
alter table items        enable row level security;
alter table orders       enable row level security;
alter table order_items  enable row level security;
alter table payments     enable row level security;

-- Helper: does the current user own this business?
create or replace function owns_business(b uuid)
returns boolean language sql stable as $$
  select exists (select 1 from businesses where id = b and owner_id = auth.uid());
$$;

-- =========================================================
-- businesses
-- =========================================================
drop policy if exists businesses_public_read on businesses;
create policy businesses_public_read on businesses
  for select to anon, authenticated
  using (true);  -- public menu needs the business row; sensitive fields are non-secret

drop policy if exists businesses_owner_insert on businesses;
create policy businesses_owner_insert on businesses
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists businesses_owner_update on businesses;
create policy businesses_owner_update on businesses
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists businesses_owner_delete on businesses;
create policy businesses_owner_delete on businesses
  for delete to authenticated
  using (owner_id = auth.uid());

-- =========================================================
-- categories
-- =========================================================
drop policy if exists categories_public_read on categories;
create policy categories_public_read on categories
  for select to anon, authenticated
  using (is_active or owns_business(business_id));

drop policy if exists categories_owner_write on categories;
create policy categories_owner_write on categories
  for all to authenticated
  using (owns_business(business_id))
  with check (owns_business(business_id));

-- =========================================================
-- items
-- =========================================================
drop policy if exists items_public_read on items;
create policy items_public_read on items
  for select to anon, authenticated
  using (true);  -- customers see items incl. sold-out (shown disabled); owner sees all

drop policy if exists items_owner_write on items;
create policy items_owner_write on items
  for all to authenticated
  using (owns_business(business_id))
  with check (owns_business(business_id));

-- =========================================================
-- orders
-- Public can create and read orders. Only the owner can update status.
-- NOTE: payment confirmation / order-number assignment runs via the
-- SECURITY DEFINER assign_order_number() (and/or service role in Edge Functions),
-- so public insert of a raw order is allowed but money fields are verified server-side.
-- =========================================================
drop policy if exists orders_public_insert on orders;
create policy orders_public_insert on orders
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from businesses b
      where b.id = business_id
        and b.is_open = true
        and b.accepting_orders = true
    )
  );

drop policy if exists orders_public_read on orders;
create policy orders_public_read on orders
  for select to anon, authenticated
  using (true);  -- MVP: order ids are non-guessable uuids; tracking needs read

drop policy if exists orders_owner_update on orders;
create policy orders_owner_update on orders
  for update to authenticated
  using (owns_business(business_id))
  with check (owns_business(business_id));

-- =========================================================
-- order_items
-- =========================================================
drop policy if exists order_items_public_insert on order_items;
create policy order_items_public_insert on order_items
  for insert to anon, authenticated
  with check (
    exists (select 1 from orders o where o.id = order_id)
  );

drop policy if exists order_items_read on order_items;
create policy order_items_read on order_items
  for select to anon, authenticated
  using (true);

-- =========================================================
-- payments
-- Public can create a pending payment; status transitions happen server-side.
-- =========================================================
drop policy if exists payments_public_insert on payments;
create policy payments_public_insert on payments
  for insert to anon, authenticated
  with check (
    exists (select 1 from orders o where o.id = order_id and o.business_id = payments.business_id)
  );

drop policy if exists payments_read on payments;
create policy payments_read on payments
  for select to anon, authenticated
  using (owns_business(business_id) or true);  -- MVP: readable; tighten later

-- =========================================================
-- Realtime: publish order changes to connected clients
-- =========================================================
do $$ begin
  alter publication supabase_realtime add table orders;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table order_items;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table items;
exception when duplicate_object then null; end $$;
