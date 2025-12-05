-- Fix match_items function to be more flexible with vector dimensions
-- This resolves "No operator matches the given name and argument types" error

drop function if exists match_items(vector(768), float, int);
drop function if exists match_items(vector(1536), float, int);
drop function if exists match_items(vector, float, int);

create or replace function match_items (
  query_embedding vector,
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
