-- 优化 public.orders 表的 RLS 策略
-- 修复 auth_rls_initplan (性能警告) 和 multiple_permissive_policies (多重策略警告) 问题

-- 1. 删除旧策略 (Drop existing policies)
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Sellers can update their received orders" ON public.orders;

-- 2. 创建优化后的 SELECT 策略
-- 使用 (select auth.uid()) 替代 auth.uid() 以避免每行重新计算
CREATE POLICY "Users can view their own orders"
ON public.orders
FOR SELECT
USING (
  buyer_id = (select auth.uid()) OR seller_id = (select auth.uid())
);

-- 3. 创建优化后的 INSERT 策略
CREATE POLICY "Buyers can insert orders"
ON public.orders
FOR INSERT
WITH CHECK (
  buyer_id = (select auth.uid())
);

-- 4. 创建优化后的 UPDATE 策略
-- 合并了买家和卖家的更新权限，解决了 multiple_permissive_policies 警告
-- 同时应用了性能优化
CREATE POLICY "Users can update related orders"
ON public.orders
FOR UPDATE
USING (
  buyer_id = (select auth.uid()) OR seller_id = (select auth.uid())
);


-- 优化 public.items 表的 RLS 策略
-- 修复 auth_rls_initplan 问题

-- 1. 删除旧策略
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.items;

-- 2. 创建优化后的 INSERT 策略
CREATE POLICY "Enable insert for authenticated users only"
ON public.items
FOR INSERT
WITH CHECK (
  author_id = (select auth.uid())
);
