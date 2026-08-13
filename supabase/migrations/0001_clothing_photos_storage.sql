insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clothing-photos', 'clothing-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "users can read own clothing photos"
on storage.objects for select
to authenticated
using (bucket_id = 'clothing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can upload own clothing photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'clothing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete own clothing photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'clothing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
