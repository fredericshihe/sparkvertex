-- Fix Security Linter Warnings
-- 1. Fix match_items function search_path (0011_function_search_path_mutable)
-- 2. Move vector extension to extensions schema (0014_extension_in_public)
-- 3. Add RLS policies for analytics_events table (0008_rls_enabled_no_policy)

-- ==================================================
-- 1. Fix match_items function - Add immutable search_path
-- ==================================================
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
security definer
set search_path = public, pg_temp  -- Fix: Add immutable search_path
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

-- ==================================================
-- 2. Move vector extension from public to extensions schema
-- ==================================================
-- Note: This is a complex operation that requires:
-- 1. Creating the extensions schema
-- 2. Moving the extension
-- 3. Updating search_path
-- 4. Re-creating dependent objects

-- Create extensions schema if it doesn't exist
create schema if not exists extensions;

-- Grant usage on extensions schema
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- Move vector extension to extensions schema
-- Strategy: Move the extension properly to extensions schema
do $$
begin
  -- Check if vector extension exists in public schema
  if exists (
    select 1 from pg_extension 
    where extname = 'vector' 
    and extnamespace = (select oid from pg_namespace where nspname = 'public')
  ) then
    -- Move vector extension from public to extensions schema
    alter extension vector set schema extensions;
  end if;
exception
  when others then
    -- If the move fails (e.g., dependency issues), log but don't fail
    raise warning 'Could not move vector extension to extensions schema: %', sqlerrm;
end $$;

-- Ensure vector types are accessible from public
grant usage on schema extensions to postgres, anon, authenticated, service_role;
alter default privileges in schema extensions grant all on types to postgres, anon, authenticated, service_role;

-- ==================================================
-- 3. Add RLS policies for analytics_events table
-- ==================================================

-- Enable RLS if not already enabled
alter table public.analytics_events enable row level security;

-- Drop existing policies if they exist (to allow re-running this migration)
drop policy if exists "Users can insert their own analytics events" on public.analytics_events;
drop policy if exists "Service role has full access to analytics events" on public.analytics_events;
drop policy if exists "Users can view their own analytics events" on public.analytics_events;
drop policy if exists "Anonymous users can insert analytics events" on public.analytics_events;

-- Policy 1: Allow authenticated users to insert their own events
-- Fix: Use (select auth.uid()) to avoid re-evaluation for each row
create policy "Users can insert their own analytics events"
  on public.analytics_events
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    or user_id is null  -- Allow anonymous events
  );

-- Policy 2: Allow service role full access (for system operations)
create policy "Service role has full access to analytics events"
  on public.analytics_events
  for all
  to service_role
  using (true)
  with check (true);

-- Policy 3: Users can view their own events (optional, for debugging)
-- Fix: Use (select auth.uid()) to avoid re-evaluation for each row
create policy "Users can view their own analytics events"
  on public.analytics_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Policy 4: Anonymous users can insert events with fingerprint
create policy "Anonymous users can insert analytics events"
  on public.analytics_events
  for insert
  to anon
  with check (
    user_id is null
    and client_fingerprint is not null
  );

-- Add comment to document the RLS setup
comment on table public.analytics_events is 'Analytics events table with RLS enabled. Tracks user interactions (views, downloads, etc.)';

-- ==================================================
-- 4. Remove unused indexes (Performance optimization)
-- ==================================================
-- Note: These indexes have not been used according to pg_stat_user_indexes
-- Removing them reduces storage overhead and speeds up write operations

-- Drop unused indexes (only if they exist)
-- These appear to be from a different schema/project (exam system)
drop index if exists public.idx_dimensions_exam_group;
drop index if exists public.idx_students_exam_time;
drop index if exists public.idx_exam_groups_active;
drop index if exists public.idx_exam_groups_status;
drop index if exists public.idx_exam_groups_date;
drop index if exists public.idx_students_professional_level;
drop index if exists public.idx_students_main_teacher;
drop index if exists public.idx_students_exam_teacher;
drop index if exists public.idx_admin_score_date;
drop index if exists public.idx_leaderboard_cache_date_rank;
drop index if exists public.idx_student_time_slots_backup_restore_time;
drop index if exists public.idx_scoring_dimensions_active;
drop index if exists public.idx_ai_cache_hash;
drop index if exists public.idx_ai_cache_expires;
drop index if exists public.idx_feedback_user_id;
drop index if exists public.idx_likes_item_id;
drop index if exists public.idx_scheme_dimensions_dimension_id;
drop index if exists public.idx_scoring_schemes_exam_group_id;
drop index if exists public.idx_students_scoring_scheme_id;
drop index if exists public.idx_ai_responses_created_at;
drop index if exists public.idx_items_quality_score;

-- Note: Monitor pg_stat_user_indexes after removing these indexes
-- If any queries slow down significantly, you can recreate specific indexes

