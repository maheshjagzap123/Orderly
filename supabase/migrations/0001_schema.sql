-- Orderly — core schema
-- Street-food ordering + POS. Vendors own businesses; customers order without accounts.

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type order_status as enum ('NEW','ACCEPTED','PREPARING','READY','COMPLETED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('INITIATED','PENDING','SUCCESS','FAILED','CANCELLED','REFUNDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_source as enum ('QR','KIOSK');
exception when duplicate_object then null; end $$;

do $$ begin
  create type item_badge as enum ('POPULAR','BESTSELLER','NEW');
exception when duplicate_object then null; end $$;

-- ---------- updated_at helper ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- businesses ----------
-- One row per stall. owner_id = auth.uid() of the vendor.
create table if not exists businesses (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  slug            text not null unique,
  description     text,
  category        text not null default 'street food',
  logo_url        text,
  -- location
  address         text,
  pincode         text,
  latitude        double precision,
  longitude       double precision,
  -- hours / operations
  open_time       time,
  close_time      time,
  prep_time_min   int,
  prep_time_max   int,
  -- live controls
  is_open         boolean not null default true,       -- manual open/closed override
  accepting_orders boolean not null default true,      -- pause toggle (distinct from closing)
  -- tax (optional)
  tax_percent     numeric(5,2) not null default 0,
  -- onboarding
  onboarding_complete boolean not null default false,
  -- order numbering counter (continuous per business)
  order_seq       int not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_businesses_owner on businesses(owner_id);
drop trigger if exists trg_businesses_updated on businesses;
create trigger trg_businesses_updated before update on businesses
  for each row execute function set_updated_at();

-- ---------- categories ----------
create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  name          text not null,
  display_order int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_categories_business on categories(business_id);
drop trigger if exists trg_categories_updated on categories;
create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();

-- ---------- items ----------
create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  description   text,
  price         numeric(10,2) not null check (price >= 0),
  image_url     text,
  is_available  boolean not null default true,
  display_order int not null default 0,
  badge         item_badge,
  prep_time_min int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_items_business on items(business_id);
create index if not exists idx_items_category on items(category_id);
drop trigger if exists trg_items_updated on items;
create trigger trg_items_updated before update on items
  for each row execute function set_updated_at();

-- ---------- orders ----------
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  order_number    int,                                  -- human-friendly, scoped per business, set on confirm
  customer_name   text,
  source          order_source not null default 'QR',
  status          order_status not null default 'NEW',
  subtotal        numeric(10,2) not null default 0,
  tax_amount      numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  payment_status  payment_status not null default 'INITIATED',
  placed_at       timestamptz not null default now(),
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_orders_business on orders(business_id);
create index if not exists idx_orders_status on orders(business_id, status);
create unique index if not exists uq_orders_number on orders(business_id, order_number) where order_number is not null;
drop trigger if exists trg_orders_updated on orders;
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

-- ---------- order_items (price snapshots) ----------
create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  item_id       uuid references items(id) on delete set null,
  item_name     text not null,                          -- snapshot
  unit_price    numeric(10,2) not null,                 -- snapshot
  quantity      int not null check (quantity > 0),
  line_total    numeric(10,2) not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_order_items_order on order_items(order_id);

-- ---------- payments ----------
create table if not exists payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  business_id     uuid not null references businesses(id) on delete cascade,
  status          payment_status not null default 'INITIATED',
  amount          numeric(10,2) not null,
  gateway         text,                                 -- e.g. 'razorpay'
  gateway_ref     text,                                 -- transaction/order id from gateway
  gateway_event_id text,                                -- for webhook idempotency
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_payments_order on payments(order_id);
create unique index if not exists uq_payments_event on payments(gateway_event_id) where gateway_event_id is not null;
drop trigger if exists trg_payments_updated on payments;
create trigger trg_payments_updated before update on payments
  for each row execute function set_updated_at();

-- ---------- order number allocation ----------
-- Atomically increments the business counter and stamps the order. Call on payment confirmation.
create or replace function assign_order_number(p_order_id uuid)
returns int language plpgsql security definer as $$
declare
  v_business uuid;
  v_num int;
begin
  select business_id into v_business from orders where id = p_order_id for update;
  if v_business is null then
    raise exception 'order % not found', p_order_id;
  end if;

  update businesses
    set order_seq = order_seq + 1
    where id = v_business
    returning order_seq into v_num;

  update orders
    set order_number = v_num,
        status = 'NEW',
        payment_status = 'SUCCESS',
        confirmed_at = now()
    where id = p_order_id;

  return v_num;
end $$;
