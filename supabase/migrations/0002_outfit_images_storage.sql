alter table outfits
  add column image_gen_model text,
  add column generation_status text
    check (generation_status in ('queued', 'processing', 'completed', 'failed')),
  add column generation_error text,
  add column generation_request_id text,
  add column generation_prompt text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('outfit-images', 'outfit-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "users can read own outfit images"
on storage.objects for select
to authenticated
using (bucket_id = 'outfit-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can upload own outfit images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'outfit-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete own outfit images"
on storage.objects for delete
to authenticated
using (bucket_id = 'outfit-images' and (storage.foldername(name))[1] = auth.uid()::text);
