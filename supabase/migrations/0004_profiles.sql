-- Orderly — profiles
-- One row per authenticated user (vendor owner). Keyed to auth.users.
-- Separates user identity from the business record and prepares for staff/team later.

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        text not null default 'owner',   -- 'owner' now; 'staff'/'admin' later
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- ---------- RLS ----------
alter table profiles enable row level security;

-- A user can read their own profile.
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select to authenticated
  using (id = auth.uid());

-- A user can insert their own profile (fallback; normally the trigger below does it).
drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles
  for insert to authenticated
  with check (id = auth.uid());

-- A user can update their own profile.
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- Auto-create a profile on signup ----------
-- Runs as the definer so it can insert into profiles when a new auth.users row appears.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
