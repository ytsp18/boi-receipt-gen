-- Supabase Update for v6.0 - API VP/SWD Integration
-- Run this SQL in Supabase SQL Editor
-- WARNING: Run on a non-production test first

-- ============================================================
-- 1. Create pending_receipts table
--    Stores data received from VP API waiting to be used
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pending_receipts (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    appointment_no TEXT NOT NULL,
    request_no TEXT NULL,
    foreigner_name TEXT NULL,
    api_photo_url TEXT NULL,
    raw_data JSONB NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    used_receipt_no TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT pending_receipts_pkey PRIMARY KEY (id),
    CONSTRAINT pending_receipts_appointment_no_key UNIQUE (appointment_no)
);

-- ============================================================
-- 2. Create indexes for pending_receipts
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pending_receipts_status
    ON public.pending_receipts (status);

CREATE INDEX IF NOT EXISTS idx_pending_receipts_appointment
    ON public.pending_receipts (appointment_no);

CREATE INDEX IF NOT EXISTS idx_pending_receipts_created_at
    ON public.pending_receipts (created_at DESC);

-- ============================================================
-- 3. Enable RLS on pending_receipts
-- ============================================================
ALTER TABLE public.pending_receipts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read pending_receipts
DROP POLICY IF EXISTS "Authenticated users can read pending_receipts" ON public.pending_receipts;
CREATE POLICY "Authenticated users can read pending_receipts" ON public.pending_receipts
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Authenticated users can update pending_receipts (change status to 'used')
DROP POLICY IF EXISTS "Authenticated users can update pending_receipts" ON public.pending_receipts;
CREATE POLICY "Authenticated users can update pending_receipts" ON public.pending_receipts
    FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Service role can insert (Edge Functions use service_role key)
DROP POLICY IF EXISTS "Service role can insert pending_receipts" ON public.pending_receipts;
CREATE POLICY "Service role can insert pending_receipts" ON public.pending_receipts
    FOR INSERT
    WITH CHECK (true);

-- Service role can do all operations
DROP POLICY IF EXISTS "Service role full access pending_receipts" ON public.pending_receipts;
CREATE POLICY "Service role full access pending_receipts" ON public.pending_receipts
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- 4. Add api_photo_url column to receipts table
-- ============================================================
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS api_photo_url TEXT NULL;

-- ============================================================
-- 5. Enable Realtime on pending_receipts (for live notifications)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_receipts;

-- ============================================================
-- 6. Create updated_at trigger for pending_receipts
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.pending_receipts;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.pending_receipts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
