-- 将所有积分 > 200 的用户积分减半
-- 执行前请先备份数据！

-- 查看将要受影响的用户（执行前预览）
SELECT 
  p.id,
  u.email,
  p.credits AS current_credits,
  p.credits / 2 AS new_credits
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.credits > 200
ORDER BY p.credits DESC;

-- 统计将受影响的用户数量
SELECT 
  COUNT(*) AS affected_users_count,
  SUM(p.credits) AS total_current_credits,
  SUM(p.credits / 2) AS total_new_credits
FROM public.profiles p
WHERE p.credits > 200;

-- 实际更新操作（确认上面的查询结果后再执行）
UPDATE public.profiles
SET credits = credits / 2
WHERE credits > 200;

-- 验证更新结果
SELECT 
  p.id,
  u.email,
  p.credits AS updated_credits
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.credits > 100
ORDER BY p.credits DESC;
