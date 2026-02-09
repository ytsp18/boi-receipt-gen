-- Supabase Performance Update for v6.2
-- Run this SQL in Supabase SQL Editor
-- ============================================================
-- Purpose: Add indexes to support 250+ receipts/day workload
-- These indexes improve query performance for:
--   - Date-based filtering (default view = today)
--   - Receipt number lookups
--   - Name search (server-side search)
--   - Status filtering (unprinted receipts)
-- ============================================================

-- 1. Index on receipt_date (most important - used for daily loading)
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_date
    ON public.receipts (receipt_date DESC);

-- 2. Index on receipt_no (used for lookups, next number generation)
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_no
    ON public.receipts (receipt_no DESC);

-- 3. Index on created_at (used for ordering, activity tracking)
CREATE INDEX IF NOT EXISTS idx_receipts_created_at
    ON public.receipts (created_at DESC);

-- 4. Partial index on is_printed (fast filter for unprinted receipts)
CREATE INDEX IF NOT EXISTS idx_receipts_not_printed
    ON public.receipts (receipt_date DESC)
    WHERE is_printed = false;

-- 5. Partial index on is_received (fast filter for unreceived receipts)
CREATE INDEX IF NOT EXISTS idx_receipts_not_received
    ON public.receipts (receipt_date DESC)
    WHERE is_received = false;

-- 6. Index on activity_logs for faster log queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
    ON public.activity_logs (created_at DESC);

-- ============================================================
-- Note: Trigram index for name search (requires pg_trgm extension)
-- Uncomment below if pg_trgm is enabled on your Supabase project:
-- ============================================================
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_receipts_foreigner_name_trgm
--     ON public.receipts USING gin (foreigner_name gin_trgm_ops);
-- ============================================================

-- Verify indexes were created
-- Run: SELECT indexname FROM pg_indexes WHERE tablename = 'receipts';
