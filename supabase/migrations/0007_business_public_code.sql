-- Orderly — unguessable public business code
--
-- The slug alone (e.g. "burger-king") is guessable, so anyone could open a
-- vendor's /order or /kiosk page by typing the business name. We add a short,
-- random public_code and make the public URL "<slug>-<code>" (readable AND
-- unguessable). The slug stays stable/internal; the code is what makes the link
-- hard to guess.
--
-- Additive + backward-compatible: existing plain-slug links still resolve
-- (the app falls back to a slug lookup), so already-printed QRs keep working.

-- 6-char base36 code, lowercase, collision-checked by the unique index.
create or replace function gen_public_code()
returns text language sql volatile as $$
  select lower(substr(encode(gen_random_bytes(8), 'hex'), 1, 6));
$$;

alter table businesses add column if not exists public_code text;

-- Backfill existing rows.
update businesses set public_code = gen_public_code() where public_code is null;

-- Enforce presence + uniqueness going forward.
alter table businesses alter column public_code set default gen_public_code();
alter table businesses alter column public_code set not null;
create unique index if not exists uq_businesses_public_code on businesses(public_code);

-- Extend the public tracking RPC (from 0006) to also return the business public
-- code, so the customer "Order Again" button can rebuild the unguessable link.
-- Must DROP first: Postgres can't change a function's return type via REPLACE.
drop function if exists get_order_tracking(uuid);
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
  business_public_code text,
  prep_time_min int,
  prep_time_max int
)
language sql security definer stable as $$
  select
    o.order_number, o.status, o.payment_status, o.customer_name,
    o.subtotal, o.tax_amount, o.total, o.placed_at, o.cancel_reason,
    b.id, b.name, b.slug, b.public_code, b.prep_time_min, b.prep_time_max
  from orders o
  join businesses b on b.id = o.business_id
  where o.track_token = p_token
$$;

grant execute on function get_order_tracking(uuid) to anon, authenticated;
