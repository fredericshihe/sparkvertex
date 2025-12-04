-- Add recommendation scoring columns to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
ADD COLUMN IF NOT EXISTS richness_score INTEGER CHECK (richness_score >= 0 AND richness_score <= 100),
ADD COLUMN IF NOT EXISTS utility_score INTEGER CHECK (utility_score >= 0 AND utility_score <= 100),
ADD COLUMN IF NOT EXISTS total_score NUMERIC(5, 2), -- Weighted average
ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS daily_rank INTEGER,
ADD COLUMN IF NOT EXISTS analysis_reason TEXT;

-- Add index for efficient querying of unanalyzed items
CREATE INDEX IF NOT EXISTS idx_items_last_analyzed_at ON items(last_analyzed_at);
CREATE INDEX IF NOT EXISTS idx_items_total_score ON items(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_items_daily_rank ON items(daily_rank);

-- Function to calculate total score automatically
CREATE OR REPLACE FUNCTION calculate_item_total_score()
RETURNS TRIGGER 
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Weights: Quality 40%, Utility 40%, Richness 20%
  IF NEW.quality_score IS NOT NULL AND NEW.richness_score IS NOT NULL AND NEW.utility_score IS NOT NULL THEN
    NEW.total_score := (NEW.quality_score * 0.4) + (NEW.utility_score * 0.4) + (NEW.richness_score * 0.2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update total_score before update/insert
DROP TRIGGER IF EXISTS update_item_total_score ON items;
CREATE TRIGGER update_item_total_score
BEFORE INSERT OR UPDATE OF quality_score, richness_score, utility_score ON items
FOR EACH ROW
EXECUTE FUNCTION calculate_item_total_score();

-- Function to update daily ranks based on scores and popularity
-- Optimized for balance: Prevents long-term dominance and gives exposure to new/old high-quality apps
CREATE OR REPLACE FUNCTION update_daily_ranks()
RETURNS void 
SET search_path = public, pg_temp
AS $$
BEGIN
  WITH ranked_items AS (
    SELECT 
      id,
      RANK() OVER (
        ORDER BY 
          (
            -- 1. Quality Score (50% Weight): Intrinsic value (0-50 pts)
            COALESCE(total_score, 0) * 0.5
            
            -- 2. Popularity (Logarithmic): Prevents "Rich get Richer" monopoly (0-30 pts approx)
            -- log10(10) = 10pts, log10(100) = 20pts, log10(1000) = 30pts
            + (CASE WHEN likes > 0 THEN LOG(likes + 1) * 10 ELSE 0 END)
            
            -- 3. Freshness Boost (Decay): Gives new apps a "Honeymoon Phase" (0-30 pts)
            -- Decays to 0 over 60 days. Day 0 = 30pts.
            + (GREATEST(0, 60 - EXTRACT(DAY FROM (NOW() - created_at))) * 0.5)
            
            -- 4. Random Jitter (Shuffle): Gives old/hidden gems a chance to surface (0-15 pts)
            -- Ensures the list isn't static every day
            + (RANDOM() * 15)
          ) DESC
      ) as new_rank
    FROM items
    WHERE is_public = true
  )
  UPDATE items
  SET daily_rank = ranked_items.new_rank
  FROM ranked_items
  WHERE items.id = ranked_items.id;
END;
$$ LANGUAGE plpgsql;
