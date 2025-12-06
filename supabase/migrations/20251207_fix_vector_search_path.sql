-- Fix vector extension search path issue
-- Problem: Vector extension was moved to extensions schema but functions still reference public schema

-- Ensure vector extension is accessible
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Drop and recreate match_items function with correct search_path
DROP FUNCTION IF EXISTS match_items(vector(768), float, int);
DROP FUNCTION IF EXISTS match_items(vector(768), double precision, integer);
DROP FUNCTION IF EXISTS match_items(vector(1536), float, int);
DROP FUNCTION IF EXISTS match_items(vector(1536), double precision, integer);

-- Recreate match_items function with extensions schema in search_path
CREATE OR REPLACE FUNCTION match_items(
  query_embedding vector(768),
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE (
  id bigint,
  title text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.title,
    (1 - (items.embedding <=> query_embedding))::double precision as similarity
  FROM public.items
  WHERE items.embedding IS NOT NULL
    AND (1 - (items.embedding <=> query_embedding)) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION match_items(vector(768), double precision, integer) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION match_items IS 'Vector similarity search with extensions schema support';
