-- 修复注册错误的 SQL 脚本
-- 请在 Supabase Dashboard -> SQL Editor 中运行此脚本

-- 1. 确保 profiles 表存在
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  username text,
  full_name text,
  avatar_url text,
  website text
);

-- 2. 启用 RLS (行级安全)
alter table public.profiles enable row level security;

-- 3. 创建访问策略 (如果已存在会报错，可以忽略)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Public profiles are viewable by everyone.') then
    create policy "Public profiles are viewable by everyone." on profiles for select using ( true );
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Users can insert their own profile.') then
    create policy "Users can insert their own profile." on profiles for insert with check ( auth.uid() = id );
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Users can update own profile.') then
    create policy "Users can update own profile." on profiles for update using ( auth.uid() = id );
  end if;
end
$$;

-- 4. 创建处理新用户的函数 (核心修复部分)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, username)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    split_part(new.email, '@', 1) -- 默认使用邮箱前缀作为用户名
  )
  on conflict (id) do nothing; -- 防止重复插入报错
  return new;
end;
$$;

-- 5. 重新绑定触发器
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
