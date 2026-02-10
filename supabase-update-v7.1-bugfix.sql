-- ============================================================
-- v7.1 - Bug Fix: Add updated_at trigger on receipts table
-- ============================================================
-- Issue: receipts table was missing the updated_at trigger.
-- This caused updated_at to never change on edits.
-- Status: APPLIED on Production (2026-02-10)
-- ============================================================

-- Create function (CREATE OR REPLACE so it's safe to re-run)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger to receipts table
DROP TRIGGER IF EXISTS set_updated_at ON public.receipts;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.receipts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
