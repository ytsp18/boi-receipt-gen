-- ============================================================
-- Full SIT Environment Setup
-- BOI Work Permit Receipt System v7.0
-- ============================================================
-- Run this ENTIRE script in Supabase SQL Editor (SIT project)
-- This creates ALL tables, indexes, RLS policies from scratch
-- ============================================================

-- ============================================================
-- 1. PROFILES TABLE (created by Supabase Auth trigger usually)
--    We create it manually for SIT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    role TEXT DEFAULT 'user',
    is_approved BOOLEAN DEFAULT TRUE,
    approved_by UUID REFERENCES auth.users,
    approved_at TIMESTAMPTZ,
    signature_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles" ON public.profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role, is_approved)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email,
        'user',
        FALSE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. RECEIPTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    receipt_no TEXT NOT NULL UNIQUE,
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    foreigner_name TEXT,
    sn_number TEXT,
    request_no TEXT,
    appointment_no TEXT,
    card_image_url TEXT,
    api_photo_url TEXT,
    is_printed BOOLEAN DEFAULT FALSE,
    printed_at TIMESTAMPTZ,
    is_received BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMPTZ,
    -- v7.0 - Photo & Signature
    recipient_photo_url TEXT,
    recipient_signature_url TEXT,
    officer_signature_url TEXT,
    created_by UUID REFERENCES auth.users,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT receipts_pkey PRIMARY KEY (id)
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read receipts" ON public.receipts;
CREATE POLICY "Authenticated users can read receipts" ON public.receipts
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert receipts" ON public.receipts;
CREATE POLICY "Authenticated users can insert receipts" ON public.receipts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update receipts" ON public.receipts;
CREATE POLICY "Authenticated users can update receipts" ON public.receipts
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can delete receipts" ON public.receipts;
CREATE POLICY "Admin can delete receipts" ON public.receipts
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- 3. ACTIVITY_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    receipt_no TEXT,
    details JSONB,
    user_id UUID,
    user_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT activity_logs_pkey PRIMARY KEY (id)
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert activity_logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert activity_logs" ON public.activity_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read activity_logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can read activity_logs" ON public.activity_logs
    FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 4. PENDING_RECEIPTS TABLE (API Integration v6.0)
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

ALTER TABLE public.pending_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read pending_receipts" ON public.pending_receipts;
CREATE POLICY "Authenticated users can read pending_receipts" ON public.pending_receipts
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update pending_receipts" ON public.pending_receipts;
CREATE POLICY "Authenticated users can update pending_receipts" ON public.pending_receipts
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role can insert pending_receipts" ON public.pending_receipts;
CREATE POLICY "Service role can insert pending_receipts" ON public.pending_receipts
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access pending_receipts" ON public.pending_receipts;
CREATE POLICY "Service role full access pending_receipts" ON public.pending_receipts
    FOR ALL USING (auth.role() = 'service_role');

-- updated_at trigger
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
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. SETTINGS TABLE (v5.1)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_by UUID REFERENCES auth.users,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read settings" ON public.settings;
CREATE POLICY "Anyone can read settings" ON public.settings
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.settings;
CREATE POLICY "Authenticated users can update settings" ON public.settings
    FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO public.settings (key, value)
VALUES ('google_sheet_sync', '{"enabled": true}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 6. UX_ANALYTICS TABLE (v6.3)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ux_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    user_id UUID NULL,
    user_role TEXT NULL,
    event_type TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_data JSONB NULL,
    duration_ms INTEGER NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT ux_analytics_pkey PRIMARY KEY (id)
);

ALTER TABLE public.ux_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert ux_analytics" ON public.ux_analytics;
CREATE POLICY "Authenticated users can insert ux_analytics" ON public.ux_analytics
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can read ux_analytics" ON public.ux_analytics;
CREATE POLICY "Admin can read ux_analytics" ON public.ux_analytics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- 7. ALL INDEXES
-- ============================================================

-- Receipts indexes (v6.2)
CREATE INDEX IF NOT EXISTS idx_receipts_receipt_date
    ON public.receipts (receipt_date DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_receipt_no
    ON public.receipts (receipt_no DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_created_at
    ON public.receipts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_not_printed
    ON public.receipts (receipt_date DESC)
    WHERE is_printed = false;

CREATE INDEX IF NOT EXISTS idx_receipts_not_received
    ON public.receipts (receipt_date DESC)
    WHERE is_received = false;

-- v7.0 - Signature status index
CREATE INDEX IF NOT EXISTS idx_receipts_signature_status
    ON public.receipts (recipient_signature_url, recipient_photo_url);

-- Pending receipts indexes
CREATE INDEX IF NOT EXISTS idx_pending_receipts_status
    ON public.pending_receipts (status);

CREATE INDEX IF NOT EXISTS idx_pending_receipts_appointment
    ON public.pending_receipts (appointment_no);

CREATE INDEX IF NOT EXISTS idx_pending_receipts_created_at
    ON public.pending_receipts (created_at DESC);

-- Activity logs index
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
    ON public.activity_logs (created_at DESC);

-- UX Analytics indexes
CREATE INDEX IF NOT EXISTS idx_ux_analytics_created_at
    ON public.ux_analytics (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ux_analytics_event
    ON public.ux_analytics (event_type, event_name);

CREATE INDEX IF NOT EXISTS idx_ux_analytics_session
    ON public.ux_analytics (session_id);

CREATE INDEX IF NOT EXISTS idx_ux_analytics_user_role
    ON public.ux_analytics (user_role);

-- ============================================================
-- 8. ENABLE REALTIME (optional for SIT)
-- ============================================================
-- Uncomment if you want realtime notifications in SIT:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_receipts;

-- ============================================================
-- SETUP COMPLETE!
-- ============================================================
-- Next steps:
-- 1. Create Storage bucket 'card-images' in Supabase Dashboard
--    → Storage → New Bucket → Name: card-images → Public: ON
-- 2. Set Storage policy:
--    → Allow authenticated users to upload/read
-- 3. Create a test user:
--    → Authentication → Users → Add User
--    → Then manually set role to 'admin' in profiles table:
--    UPDATE public.profiles SET role = 'admin', is_approved = true
--    WHERE email = 'your-test-email@example.com';
-- ============================================================
