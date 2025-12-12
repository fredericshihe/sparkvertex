-- Fix search_path for get_tag_counts to satisfy linter
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

-- Fix search_path for strip_spark_watermark to satisfy linter
CREATE OR REPLACE FUNCTION strip_spark_watermark(content TEXT) 
RETURNS TEXT 
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    stripped TEXT;
BEGIN
    stripped := content;
    
    -- Remove SparkVertex header comment block (contains random ID and date)
    stripped := regexp_replace(stripped, '<!--\s*={50,}[\s\S]*?SparkVertex[\s\S]*?={50,}\s*-->', '', 'gi');
    
    -- Remove spark-vertex-id meta tag
    stripped := regexp_replace(stripped, '<meta\s+name=[''"]spark-vertex-id[''"][^>]*>', '', 'gi');
    stripped := regexp_replace(stripped, '<meta\s+name=[''"]generator[''"][^>]*SparkVertex[^>]*>', '', 'gi');
    
    -- Remove SPARK_VERTEX_ID protection script
    stripped := regexp_replace(stripped, '<script>\s*\(function\(\)\{[\s\S]*?SPARK_VERTEX_ID[\s\S]*?\}\)\(\);\s*</script>', '', 'gi');
    
    -- Remove PUBLIC VERSION comment
    stripped := regexp_replace(stripped, '<!--\s*PUBLIC VERSION[\s\S]*?-->', '', 'gi');

    -- Remove charset meta tag (injectWatermark enforces UTF-8, causing mismatch with original)
    stripped := regexp_replace(stripped, '<meta[^>]*charset=[^>]*>', '', 'gi');
    
    RETURN stripped;
END;
$$;
