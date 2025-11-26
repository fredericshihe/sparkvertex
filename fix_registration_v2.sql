-- 终极修复注册脚本 (Fix Registration V2)
-- 请务必在 Supabase Dashboard -> SQL Editor 中运行此脚本

-- 1. 先清理旧的触发器和函数，防止冲突
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 2. 确保 profiles 表存在且权限正确
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  username text,
  full_name text,
  avatar_url text,
  website text
);

-- 启用 RLS
alter table public.profiles enable row level security;

-- 重新创建策略 (先删除旧的以防万一)
drop policy if exists "Public profiles are viewable by everyone." on profiles;
drop policy if exists "Users can insert their own profile." on profiles;
drop policy if exists "Users can update own profile." on profiles;

create policy "Public profiles are viewable by everyone." on profiles for select using ( true );
create policy "Users can insert their own profile." on profiles for insert with check ( auth.uid() = id );
create policy "Users can update own profile." on profiles for update using ( auth.uid() = id );

-- 3. 创建更健壮的新用户处理函数
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, username)
  values (
    new.id,
    -- 优先使用元数据中的名字，如果没有则用邮箱前缀，再没有则叫 User
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'User'),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user')
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- 如果插入 profile 失败，捕获错误并记录，但允许用户创建成功
    -- 这样至少用户能注册进来，不会报 "Database error"
    raise warning 'Error creating profile for user %: %', new.id, SQLERRM;
    return new;
end;
$$;

-- 4. 重新绑定触发器
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
