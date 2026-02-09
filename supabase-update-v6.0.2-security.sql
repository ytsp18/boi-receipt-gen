-- Supabase Security Update for v6.0.2
-- Run this SQL in Supabase SQL Editor
-- ============================================================

-- Fix: Tighten pending_receipts INSERT policy
-- Previously: WITH CHECK (true) allowed any authenticated user to insert
-- Now: Only service_role can insert (Edge Functions use service_role key)
-- Note: The "Service role full access" policy already covers service_role,
-- so we just need to remove the overly permissive INSERT policy.

DROP POLICY IF EXISTS "Service role can insert pending_receipts" ON public.pending_receipts;
CREATE POLICY "Service role can insert pending_receipts" ON public.pending_receipts
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
