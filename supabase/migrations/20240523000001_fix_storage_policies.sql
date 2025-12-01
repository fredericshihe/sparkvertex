
-- Create the storage bucket 'temp-generations' if it doesn't exist
insert into storage.buckets (id, name, public)
values ('temp-generations', 'temp-generations', true)
on conflict (id) do nothing;

-- Drop existing policies to avoid conflicts (idempotency)
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Users can delete own images" on storage.objects;

-- Re-create policies
-- 1. Allow public read access (so LLM can read the image)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'temp-generations' );

-- 2. Allow authenticated users to upload images
create policy "Authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'temp-generations' );

-- 3. Allow users to delete their own images
create policy "Users can delete own images"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'temp-generations' AND auth.uid() = owner );
