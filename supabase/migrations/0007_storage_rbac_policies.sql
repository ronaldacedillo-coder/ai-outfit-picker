-- Rewrites clothing-photos bucket policies (migration 0001) from
-- per-user-folder ownership to role-based: ADMIN gets full CRUD
-- bucket-wide, STORE/CUSTOMER get SELECT-only bucket-wide. Object paths
-- stop being a visibility boundary now that the catalog is shared -- an
-- uploaded photo's folder prefix is just the uploading admin's id, not an
-- access-control mechanism.
--
-- outfit-images (migration 0002) is deliberately left untouched here: a
-- generated visualization is the result of one user's own session (their
-- chosen combination/occasion), not catalog data, so it stays
-- per-generating-user-owned for every role.

drop policy if exists "users can read own clothing photos" on storage.objects;
drop policy if exists "users can upload own clothing photos" on storage.objects;
drop policy if exists "users can delete own clothing photos" on storage.objects;

create policy "clothing-photos: select all authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'clothing-photos');

create policy "clothing-photos: admin insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'clothing-photos' and public.current_user_role() = 'ADMIN');

create policy "clothing-photos: admin update"
on storage.objects for update
to authenticated
using (bucket_id = 'clothing-photos' and public.current_user_role() = 'ADMIN')
with check (bucket_id = 'clothing-photos' and public.current_user_role() = 'ADMIN');

create policy "clothing-photos: admin delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'clothing-photos' and public.current_user_role() = 'ADMIN');
