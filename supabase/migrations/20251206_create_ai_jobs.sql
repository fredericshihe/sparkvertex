-- 1. Create AI Jobs Table
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  system_prompt text,
  user_prompt text,
  temperature double precision DEFAULT 0.7,
  status text DEFAULT 'queued', -- queued | running | succeeded | failed
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_created ON public.ai_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_created ON public.ai_jobs (user_id, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Users can view their own jobs
CREATE POLICY "Users can view own ai_jobs" ON public.ai_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own jobs (via RPC mostly, but good to have)
CREATE POLICY "Users can insert own ai_jobs" ON public.ai_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service Role can do everything (for the processor)
-- (Implicitly allowed, but explicit policies for service_role are sometimes needed if force_rls is on)

-- 5. Create Enqueue RPC Function
CREATE OR REPLACE FUNCTION public.enqueue_ai_job(p_system text, p_user text, p_temp double precision DEFAULT 0.7)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ai_jobs(user_id, system_prompt, user_prompt, temperature)
  VALUES (auth.uid(), p_system, p_user, COALESCE(p_temp, 0.7))
  RETURNING id INTO v_id;
  return v_id;
END;
$$;

-- 6. Grant Permissions
GRANT EXECUTE ON FUNCTION public.enqueue_ai_job(text, text, double precision) TO anon, authenticated;
GRANT ALL ON TABLE public.ai_jobs TO service_role;
GRANT SELECT, INSERT ON TABLE public.ai_jobs TO authenticated;
