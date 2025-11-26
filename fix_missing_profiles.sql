-- 修复现有用户缺失 Profile 的脚本
-- 如果您遇到 406 错误或无法加载个人资料，请运行此脚本

INSERT INTO public.profiles (id, full_name, avatar_url, username)
SELECT 
    id,
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'User'),
    COALESCE(raw_user_meta_data->>'avatar_url', ''),
    COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1), 'user')
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
