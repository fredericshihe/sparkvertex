-- Create a function to get tag counts efficiently
create or replace function get_tag_counts()
returns table (tag text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    t.tag,
    count(*) as count
  from (
    select unnest(tags) as tag
    from items
    where is_public = true
  ) t
  group by t.tag;
end;
$$;
