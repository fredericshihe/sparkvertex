-- 修复向量维度不匹配问题 (1536 -> 768)
-- 您的数据库当前可能配置为 1536 维 (OpenAI)，但代码使用的是 768 维 (Gemini)

-- 1. 删除依赖于旧列的索引
drop index if exists items_embedding_idx;

-- 2. 修改 embedding 列的维度为 768
-- 注意：这会清除现有的 embedding 数据，因为维度不同无法转换
alter table items alter column embedding type vector(768) using null;

-- 3. 重新创建索引
create index items_embedding_idx on items using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- 4. 重建匹配函数 (确保参数也是 768 维)
drop function if exists match_items(vector, float, int);
drop function if exists match_items(vector(1536), float, int);
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
