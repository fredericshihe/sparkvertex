-- Add has_permanent_storage column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS has_permanent_storage BOOLEAN DEFAULT FALSE;

-- Function to purchase permanent storage
CREATE OR REPLACE FUNCTION purchase_permanent_storage(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_credits NUMERIC;
    v_cost NUMERIC := 60;
BEGIN
    -- Check if user already has permanent storage
    IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND has_permanent_storage = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Already has permanent storage');
    END IF;

    -- Get current credits
    SELECT credits INTO v_current_credits FROM profiles WHERE id = p_user_id;
    
    IF v_current_credits < v_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient credits');
    END IF;

    -- Deduct credits and enable permanent storage
    UPDATE profiles 
    SET credits = credits - v_cost,
        has_permanent_storage = TRUE
    WHERE id = p_user_id;

    -- Record transaction (optional, if you have a transactions table)
    -- INSERT INTO transactions ...

    RETURN jsonb_build_object('success', true, 'message', 'Permanent storage purchased successfully');
END;
$$;
