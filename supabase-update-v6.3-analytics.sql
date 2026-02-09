-- Supabase Update for v6.3 - UX Analytics
-- Run this SQL in Supabase SQL Editor
-- ============================================================
-- Purpose: Create ux_analytics table for tracking user behavior
-- Data collected: action timing, user journey, errors, feature usage
-- Privacy: No PII stored — only event types, timestamps, durations
-- ============================================================

-- 1. Create ux_analytics table
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

-- 2. Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_ux_analytics_created_at
    ON public.ux_analytics (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ux_analytics_event
    ON public.ux_analytics (event_type, event_name);

CREATE INDEX IF NOT EXISTS idx_ux_analytics_session
    ON public.ux_analytics (session_id);

CREATE INDEX IF NOT EXISTS idx_ux_analytics_user_role
    ON public.ux_analytics (user_role);

-- 3. Enable Row Level Security
ALTER TABLE public.ux_analytics ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Authenticated users can INSERT (non-blocking logging)
DROP POLICY IF EXISTS "Authenticated users can insert ux_analytics" ON public.ux_analytics;
CREATE POLICY "Authenticated users can insert ux_analytics" ON public.ux_analytics
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Only admin can read analytics
DROP POLICY IF EXISTS "Admin can read ux_analytics" ON public.ux_analytics;
CREATE POLICY "Admin can read ux_analytics" ON public.ux_analytics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- Cleanup reference (run manually or via pg_cron):
-- DELETE FROM public.ux_analytics WHERE created_at < NOW() - INTERVAL '90 days';
-- ============================================================

-- Verify table was created
-- Run: SELECT * FROM public.ux_analytics LIMIT 5;
