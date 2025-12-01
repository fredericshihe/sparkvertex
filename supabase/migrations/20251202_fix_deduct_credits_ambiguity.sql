-- Drop the integer version of deduct_credits to resolve ambiguity
-- This ensures that calls with numeric values (like 0.5) default to the numeric version
DROP FUNCTION IF EXISTS deduct_credits(int);
