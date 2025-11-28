
create table if not exists generation_tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  prompt text not null,
  status text default 'pending', -- pending, processing, completed, failed
  result_code text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table generation_tasks enable row level security;

-- Policies
create policy "Users can insert their own tasks"
  on generation_tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own tasks"
  on generation_tasks for select
  using (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on generation_tasks for update
  using (auth.uid() = user_id);

-- Enable Realtime
alter publication supabase_realtime add table generation_tasks;
