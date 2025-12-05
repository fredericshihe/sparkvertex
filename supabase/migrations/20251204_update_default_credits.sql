-- Update default credits for new users to 30
ALTER TABLE profiles 
ALTER COLUMN credits SET DEFAULT 30;

-- Optional: Update existing users with very low credits? 
-- No, let's respect their current balance, or maybe give a one-time boost if needed.
-- For now, just setting the default for new signups.
