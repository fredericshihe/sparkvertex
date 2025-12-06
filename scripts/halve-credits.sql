-- 将积分为 216 或 240 的用户积分减半
-- 执行前请先备份数据！

-- 查看将要受影响的用户（执行前预览）
SELECT 
  p.id,
  u.email,
  p.credits AS current_credits,
  p.credits / 2 AS new_credits
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.credits IN (216, 240);

-- 实际更新操作（确认上面的查询结果后再执行）
UPDATE public.profiles
SET credits = credits / 2
WHERE credits IN (216, 240);

-- 验证更新结果
SELECT 
  p.id,
  u.email,
  p.credits AS updated_credits
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.id IN (
  SELECT id FROM public.profiles WHERE credits IN (108, 120)
);
