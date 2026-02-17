-- v9.4.2: Fix receipt_no generation across branches
-- Problem: getNextReceiptNo() scoped by branch_id but receipt_no has GLOBAL unique constraint
-- Solution: Branch-prefixed receipt_no format + SECURITY DEFINER RPC
--
-- Old format: 20260217-001 (no branch prefix, shared global numbering)
-- New format: BKK001-20260217-001 (branch prefix + date + sequence per branch)
--
-- Backward compat: old receipts keep old format, new receipts use new format

-- ============================================================
-- 1. Add receipt_prefix column to branches
-- ============================================================

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS receipt_prefix TEXT;

-- Set receipt_prefix for the 4 receipt-enabled branches
-- Pattern: first 3 chars of code + last 3 chars of code (e.g. BKK-SC-M-001 → BKK001)
UPDATE public.branches SET receipt_prefix = 'BKK001' WHERE code = 'BKK-SC-M-001';
UPDATE public.branches SET receipt_prefix = 'CBI001' WHERE code = 'CBI-SC-S-001';
UPDATE public.branches SET receipt_prefix = 'CMI001' WHERE code = 'CMI-SC-M-001';
UPDATE public.branches SET receipt_prefix = 'PKT001' WHERE code = 'PKT-SC-S-001';

-- For any future branches, auto-derive: first 3 chars + last 3 chars
-- (can be overridden manually in branch management UI)

-- ============================================================
-- 2. Create/Replace RPC: get_next_receipt_no(branch_id)
-- ============================================================
-- Returns next receipt_no with branch prefix, e.g. "BKK001-20260217-004"
-- Queries ALL receipts (bypasses RLS) to prevent duplicate key violation

DROP FUNCTION IF EXISTS public.get_next_receipt_no(TEXT);
DROP FUNCTION IF EXISTS public.get_next_receipt_no(UUID);

CREATE OR REPLACE FUNCTION public.get_next_receipt_no(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_prefix TEXT;
    v_date_prefix TEXT;
    v_full_prefix TEXT;
    v_last_no TEXT;
    v_last_number INT;
    v_next_number INT;
BEGIN
    -- Get branch receipt_prefix
    SELECT receipt_prefix INTO v_prefix
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_prefix IS NULL THEN
        RAISE EXCEPTION 'Branch not found or no receipt_prefix set for branch_id: %', p_branch_id;
    END IF;

    -- Build date prefix: YYYYMMDD
    v_date_prefix := to_char(CURRENT_DATE, 'YYYYMMDD');

    -- Full prefix: e.g. "BKK001-20260217"
    v_full_prefix := v_prefix || '-' || v_date_prefix;

    -- Query ALL receipts (bypasses RLS) for this branch+date prefix
    SELECT receipt_no INTO v_last_no
    FROM public.receipts
    WHERE receipt_no LIKE v_full_prefix || '-%'
    ORDER BY receipt_no DESC
    LIMIT 1;

    IF v_last_no IS NULL THEN
        v_next_number := 1;
    ELSE
        -- Extract sequence number: "BKK001-20260217-003" → split by '-' → part 3 = "003"
        v_last_number := CAST(split_part(v_last_no, '-', 3) AS INT);
        v_next_number := v_last_number + 1;
    END IF;

    -- Return formatted: "BKK001-20260217-004"
    RETURN v_full_prefix || '-' || lpad(v_next_number::TEXT, 3, '0');
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_next_receipt_no(UUID) TO authenticated;

-- ============================================================
-- 3. Verify
-- ============================================================
-- Test with BKK branch (replace UUID with actual BKK branch id)
-- SELECT public.get_next_receipt_no('your-bkk-branch-uuid-here');

-- Check receipt_prefix values
SELECT code, receipt_prefix FROM public.branches WHERE receipt_prefix IS NOT NULL;
