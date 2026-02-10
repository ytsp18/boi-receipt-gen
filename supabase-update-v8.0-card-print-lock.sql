-- ============================================================
-- v8.0 - Card Print Lock: Replace Google Sheet lock mechanism
-- ============================================================
-- Purpose: Real-time lock system for card printing to prevent
--          duplicate prints by multiple officers.
-- Replaces: Google Sheet "บันทึกรายการห้ามซ้ำ V3"
-- Tables: card_print_locks (active), card_print_locks_archive
-- Features: UNIQUE constraint, normalize trigger, RLS, Realtime,
--           auto-archive after 48h, auto-delete archive after 90d
-- ============================================================

-- ============================================================
-- 1. Main table: card_print_locks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.card_print_locks (
    id UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Lock identifier (unique per appointment)
    appointment_id TEXT NOT NULL,

    -- Data from e-Workpermit OS pool (officer copy-paste)
    request_no TEXT NULL,
    passport_no TEXT NULL,
    foreigner_name TEXT NULL,

    -- Officer info (auto-fill from auth)
    officer_id UUID NOT NULL,
    officer_name TEXT NOT NULL,

    -- Card serial numbers
    sn_good TEXT NULL,
    sn_spoiled TEXT NULL,
    spoiled_reason TEXT NULL,

    -- Status: locked -> printed -> completed
    status TEXT NOT NULL DEFAULT 'locked',
    lock_date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT card_print_locks_pkey PRIMARY KEY (id),
    CONSTRAINT card_print_locks_appointment_unique UNIQUE (appointment_id)
);

-- ============================================================
-- 2. Normalize trigger: trim + lowercase + remove whitespace
-- ============================================================
CREATE OR REPLACE FUNCTION normalize_appointment_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.appointment_id := LOWER(TRIM(
        REGEXP_REPLACE(NEW.appointment_id, E'[\\t\\n\\r]+', '', 'g')
    ));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_appointment_id ON public.card_print_locks;
CREATE TRIGGER trg_normalize_appointment_id
    BEFORE INSERT OR UPDATE ON public.card_print_locks
    FOR EACH ROW EXECUTE FUNCTION normalize_appointment_id();

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_card_print_locks_date
    ON public.card_print_locks (lock_date DESC);
CREATE INDEX IF NOT EXISTS idx_card_print_locks_officer
    ON public.card_print_locks (officer_id);
CREATE INDEX IF NOT EXISTS idx_card_print_locks_appointment
    ON public.card_print_locks (appointment_id);
CREATE INDEX IF NOT EXISTS idx_card_print_locks_status
    ON public.card_print_locks (status);

-- ============================================================
-- 4. Row Level Security
-- ============================================================
ALTER TABLE public.card_print_locks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (see who locked what)
CREATE POLICY "Authenticated users can read card_print_locks"
    ON public.card_print_locks FOR SELECT
    USING (auth.role() = 'authenticated');

-- All authenticated users can insert (lock an appointment)
CREATE POLICY "Authenticated users can insert card_print_locks"
    ON public.card_print_locks FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Users can only update their own locks (add S/N, change status)
CREATE POLICY "Users can update own card_print_locks"
    ON public.card_print_locks FOR UPDATE
    USING (officer_id = auth.uid());

-- Admin can delete locks (unlock stuck items)
CREATE POLICY "Admin can delete card_print_locks"
    ON public.card_print_locks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- 5. Enable Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_print_locks;

-- ============================================================
-- 6. Archive table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.card_print_locks_archive (
    id UUID NOT NULL,
    appointment_id TEXT NOT NULL,
    request_no TEXT NULL,
    passport_no TEXT NULL,
    foreigner_name TEXT NULL,
    officer_id UUID NOT NULL,
    officer_name TEXT NOT NULL,
    sn_good TEXT NULL,
    sn_spoiled TEXT NULL,
    spoiled_reason TEXT NULL,
    status TEXT NOT NULL DEFAULT 'locked',
    lock_date DATE NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT card_print_locks_archive_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_card_print_locks_archive_sn
    ON public.card_print_locks_archive (sn_good, sn_spoiled);
CREATE INDEX IF NOT EXISTS idx_card_print_locks_archive_appointment
    ON public.card_print_locks_archive (appointment_id);
CREATE INDEX IF NOT EXISTS idx_card_print_locks_archive_date
    ON public.card_print_locks_archive (lock_date DESC);

-- RLS for archive: read-only for authenticated users
ALTER TABLE public.card_print_locks_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read card_print_locks_archive"
    ON public.card_print_locks_archive FOR SELECT
    USING (auth.role() = 'authenticated');

-- ============================================================
-- 7. Cleanup function: archive after 48h, delete archive after 90d
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_card_locks()
RETURNS INTEGER AS $$
DECLARE
    moved_count INTEGER;
BEGIN
    -- Move completed/old locks to archive
    INSERT INTO public.card_print_locks_archive
        (id, appointment_id, request_no, passport_no, foreigner_name,
         officer_id, officer_name, sn_good, sn_spoiled, spoiled_reason,
         status, lock_date, created_at, updated_at, archived_at)
    SELECT
        id, appointment_id, request_no, passport_no, foreigner_name,
        officer_id, officer_name, sn_good, sn_spoiled, spoiled_reason,
        status, lock_date, created_at, updated_at, now()
    FROM public.card_print_locks
    WHERE created_at < NOW() - INTERVAL '48 hours';

    GET DIAGNOSTICS moved_count = ROW_COUNT;

    -- Delete from main table
    DELETE FROM public.card_print_locks
    WHERE created_at < NOW() - INTERVAL '48 hours';

    -- Delete old archive entries (>90 days)
    DELETE FROM public.card_print_locks_archive
    WHERE archived_at < NOW() - INTERVAL '90 days';

    RETURN moved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage: SELECT cleanup_old_card_locks();
-- Recommended: Schedule with pg_cron daily at 00:00
-- SELECT cron.schedule('cleanup-card-locks', '0 0 * * *', 'SELECT cleanup_old_card_locks()');
