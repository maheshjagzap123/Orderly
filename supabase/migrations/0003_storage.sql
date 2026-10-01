-- Orderly — Storage policies for the "menu-images" bucket
-- Bucket is public (anyone can read via public URL). Writes require authentication.

-- Public read of objects in the bucket
drop policy if exists menu_images_public_read on storage.objects;
create policy menu_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-images');

-- Authenticated users can upload
drop policy if exists menu_images_auth_insert on storage.objects;
create policy menu_images_auth_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images');

-- Authenticated users can update their own uploaded objects
drop policy if exists menu_images_auth_update on storage.objects;
create policy menu_images_auth_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and owner = auth.uid())
  with check (bucket_id = 'menu-images' and owner = auth.uid());

-- Authenticated users can delete their own uploaded objects
drop policy if exists menu_images_auth_delete on storage.objects;
create policy menu_images_auth_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and owner = auth.uid());
