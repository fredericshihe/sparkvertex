
-- Create the storage bucket 'temp-generations'
insert into storage.buckets (id, name, public)
values ('temp-generations', 'temp-generations', true)
on conflict (id) do nothing;

-- Policy to allow public read access (so LLM can read the image)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'temp-generations' );

-- Policy to allow authenticated users to upload images
create policy "Authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'temp-generations' );

-- Policy to allow users to delete their own images (optional but good practice)
create policy "Users can delete own images"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'temp-generations' AND auth.uid() = owner );
