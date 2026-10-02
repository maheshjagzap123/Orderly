-- Orderly — publish categories + businesses to realtime
--
-- The customer menu subscribes to live changes so sold-out toggles, price edits,
-- new/removed items, category activation, and store open/paused state appear
-- without a refresh. `items` was already published (0002); add the other two.

do $$ begin
  alter publication supabase_realtime add table categories;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table businesses;
exception when duplicate_object then null; end $$;
