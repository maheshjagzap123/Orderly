-- Orderly — secure public order tracking + RLS hardening
--
-- Goals (see improvement plan §20, §21):
--   * Give every order a non-guessable public tracking token.
--   * Let customers read ONLY their own order's safe tracking fields, via a
--     SECURITY DEFINER RPC keyed by that token — no table-wide public SELECT.
--   * Stop the public from enumerating payments and order_items.
--   * Vendors keep full owner-scoped access to their own data.
--
-- This migration is additive and backward-compatible: the app treats the token
-- as optional and falls back to the existing (number-based) path when a token
-- is not available, so applying it will not break an already-running client.

-- ---------- 1. Tracking token ----------
alter table orders add column if not exists track_token uuid not null default gen_random_uuid();
create unique index if not exists uq_orders_track_token on orders(track_token);

-- Backfill any legacy rows that predate the default (defensive; new rows get one).
update orders set track_token = gen_random_uuid() where track_token is null;

-- ---------- 2. Helpful indexes (see §19) ----------
create index if not exists idx_orders_placed_at on orders(placed_at);
create index if not exists idx_orders_business_placed on orders(business_id, placed_at);
create index if not exists idx_orders_number on orders(order_number);

-- ---------- 3. Public tracking RPCs (SECURITY DEFINER) ----------
-- Return ONLY fields a customer needs to track their order. No payment gateway
-- references, no internal ids beyond what tracking requires.
create or replace function get_order_tracking(p_token uuid)
returns table (
  order_number int,
  status order_status,
  payment_status payment_status,
  customer_name text,
  subtotal numeric,
  tax_amount numeric,
  total numeric,
  placed_at timestamptz,
  cancel_reason text,
  business_id uuid,
  business_name text,
  business_slug text,
  prep_time_min int,
  prep_time_max int
)
language sql security definer stable as $$
  select
    o.order_number, o.status, o.payment_status, o.customer_name,
    o.subtotal, o.tax_amount, o.total, o.placed_at, o.cancel_reason,
    b.id, b.name, b.slug, b.prep_time_min, b.prep_time_max
  from orders o
  join businesses b on b.id = o.business_id
  where o.track_token = p_token
$$;

create or replace function get_order_items_tracking(p_token uuid)
returns table (
  item_name text,
  unit_price numeric,
  quantity int,
  line_total numeric
)
language sql security definer stable as $$
  select oi.item_name, oi.unit_price, oi.quantity, oi.line_total
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.track_token = p_token
$$;

grant execute on function get_order_tracking(uuid) to anon, authenticated;
grant execute on function get_order_items_tracking(uuid) to anon, authenticated;

-- ---------- 4. RLS hardening ----------
-- payments: never publicly readable. Owner-only. (Edge Functions use the service
-- role and bypass RLS, so the Razorpay flow is unaffected.)
drop policy if exists payments_read on payments;
create policy payments_owner_read on payments
  for select to authenticated
  using (owns_business(business_id));

-- order_items: owner-only direct SELECT. Customers read via the tracking RPC above.
drop policy if exists order_items_read on order_items;
create policy order_items_owner_read on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id and owns_business(o.business_id)
    )
  );

-- orders: owner-only direct SELECT for the vendor dashboard. The public is NOT
-- allowed to read the orders table directly (prevents enumerating other
-- customers' orders). Customers read their own order ONLY via the token RPCs
-- above and the SECURITY DEFINER helpers below.
drop policy if exists orders_public_read on orders;
drop policy if exists orders_anon_read_min on orders;
create policy orders_owner_read on orders
  for select to authenticated
  using (owns_business(business_id));

-- Confirmation read-back by a KNOWN order id (used right after the client inserts
-- its own order, and by the payment poll). SECURITY DEFINER so it works without a
-- table-wide anon SELECT policy; returns only the two fields needed to confirm.
-- Knowing a random uuid order id is required, so this is not enumerable.
create or replace function get_order_confirmation(p_order_id uuid)
returns table (order_number int, payment_status payment_status, track_token uuid)
language sql security definer stable as $$
  select o.order_number, o.payment_status, o.track_token
  from orders o
  where o.id = p_order_id
$$;

grant execute on function get_order_confirmation(uuid) to anon, authenticated;

-- ---------- 5. Server-authoritative order placement (dev path) ----------
-- Creates an order + items + payment and confirms it, recomputing all money
-- from DB prices (never trusting the client). SECURITY DEFINER so it works even
-- though anon can no longer directly SELECT/INSERT-returning on orders. Returns
-- the human order number + tracking token. Replaces the browser-side multi-insert
-- in publicApi.placeOrder for the dev (no-gateway) flow.
create or replace function place_order_dev(
  p_business_id uuid,
  p_source order_source,
  p_customer_name text,
  p_lines jsonb            -- [{ "item_id": uuid, "quantity": int }, ...]
)
returns table (order_number int, track_token uuid, order_id uuid)
language plpgsql security definer as $$
declare
  v_biz businesses%rowtype;
  v_subtotal numeric(10,2) := 0;
  v_tax numeric(10,2);
  v_total numeric(10,2);
  v_order orders%rowtype;
  v_line jsonb;
  v_item items%rowtype;
  v_qty int;
  v_num int;
begin
  select * into v_biz from businesses where id = p_business_id;
  if v_biz.id is null then raise exception 'Business not found'; end if;
  if not (v_biz.is_open and v_biz.accepting_orders) then
    raise exception 'STORE_CLOSED';
  end if;

  -- Validate + total from DB prices.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from items
      where id = (v_line->>'item_id')::uuid and business_id = p_business_id;
    if v_item.id is null or not v_item.is_available then
      raise exception 'ITEM_UNAVAILABLE';
    end if;
    v_qty := (v_line->>'quantity')::int;
    if v_qty <= 0 then raise exception 'Invalid quantity'; end if;
    v_subtotal := v_subtotal + v_item.price * v_qty;
  end loop;

  v_tax := round(v_subtotal * (v_biz.tax_percent / 100.0), 2);
  v_total := v_subtotal + v_tax;

  insert into orders (business_id, source, customer_name, subtotal, tax_amount, total)
    values (p_business_id, p_source, nullif(btrim(coalesce(p_customer_name,'')), ''), v_subtotal, v_tax, v_total)
    returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from items where id = (v_line->>'item_id')::uuid;
    v_qty := (v_line->>'quantity')::int;
    insert into order_items (order_id, item_id, item_name, unit_price, quantity, line_total)
      values (v_order.id, v_item.id, v_item.name, v_item.price, v_qty, v_item.price * v_qty);
  end loop;

  insert into payments (order_id, business_id, amount, gateway)
    values (v_order.id, p_business_id, v_total, 'dev');

  -- Assign number + mark paid (same as the existing assign_order_number RPC).
  v_num := assign_order_number(v_order.id);

  return query select v_num, v_order.track_token, v_order.id;
end $$;

grant execute on function place_order_dev(uuid, order_source, text, jsonb) to anon, authenticated;
