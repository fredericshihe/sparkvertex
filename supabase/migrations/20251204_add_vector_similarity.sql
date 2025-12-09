-- Enable pgvector extension
create extension if not exists vector;

-- Add embedding column to items table
-- Google gemini-embedding-001 outputs 768 dimensions (when configured)
alter table items add column if not exists embedding vector(768);

-- Create an index for faster similarity search
-- Note: IVFFlat index is good for larger datasets. For small datasets, exact search is fine.
-- We create it just in case.
create index if not exists items_embedding_idx on items using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Create a function to match similar items
-- Drop the function first to avoid return type conflict errors
drop function if exists match_items(vector(768), float, int);

create or replace function match_items (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  title text,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    items.id,
    items.title,
    1 - (items.embedding <=> query_embedding) as similarity
  from items
  where 1 - (items.embedding <=> query_embedding) > match_threshold
  order by items.embedding <=> query_embedding
  limit match_count;
end;
$$;
