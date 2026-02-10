-- ============================================================
-- v8.1 - Fuzzy Search: pg_trgm extension + trigram indexes
-- ============================================================
-- Purpose: Enable fuzzy/similarity search for receipts
-- Benefit: Handles typos in foreign names (e.g. "Jhon" finds "John")
-- Dependency: pg_trgm extension (available on Supabase)
-- ============================================================

-- Enable trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for similarity search
CREATE INDEX IF NOT EXISTS idx_receipts_name_trgm
    ON public.receipts USING GIN (foreigner_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_no_trgm
    ON public.receipts USING GIN (receipt_no gin_trgm_ops);

-- Fuzzy search function
CREATE OR REPLACE FUNCTION search_receipts_fuzzy(
    search_query TEXT,
    max_results INT DEFAULT 100
)
RETURNS SETOF receipts AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM receipts
    WHERE foreigner_name % search_query
       OR receipt_no % search_query
       OR request_no ILIKE '%' || search_query || '%'
       OR sn_number ILIKE '%' || search_query || '%'
       OR appointment_no ILIKE '%' || search_query || '%'
    ORDER BY
        GREATEST(
            similarity(foreigner_name, search_query),
            similarity(receipt_no, search_query)
        ) DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
