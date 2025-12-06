-- Update user credits by email
-- Replace 'user@example.com' with the actual user's email
-- Replace 1000 with the desired credit amount

UPDATE profiles 
SET credits = 1000 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'user@example.com'
);

-- Or update by ID directly if you know the UUID
-- UPDATE profiles SET credits = 1000 WHERE id = 'USER_UUID';

-- To add credits instead of setting a fixed amount:
-- UPDATE profiles 
-- SET credits = COALESCE(credits, 0) + 100 
-- WHERE id IN (SELECT id FROM auth.users WHERE email = 'user@example.com');
