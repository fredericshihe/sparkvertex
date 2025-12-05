-- Create credit_orders table for system credit purchases
create table if not exists credit_orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  out_trade_no text unique not null, -- Merchant Order No
  trade_no text, -- Alipay Transaction No
  amount numeric not null, -- Amount in CNY
  credits int not null, -- Credits purchased
  status text default 'pending', -- pending, paid, failed
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table credit_orders enable row level security;

-- Allow users to view their own credit orders
create policy "Users can view own credit orders" on credit_orders
  for select using (auth.uid() = user_id);

-- Only service role can insert/update (via API)
-- But for creation, we are doing it in API route with user session, so we might need insert policy for authenticated users?
-- Actually, in create/route.ts we use createServerClient with user session, so we need insert policy.
create policy "Users can create own credit orders" on credit_orders
  for insert with check (auth.uid() = user_id);

-- Only service role (admin) can update status (via notify route)
-- We don't add update policy for users to prevent them from marking orders as paid.
