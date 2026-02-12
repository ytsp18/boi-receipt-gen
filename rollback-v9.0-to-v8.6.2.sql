-- ============================================================
-- ROLLBACK: v9.0 → v8.6.2
-- ============================================================
-- Purpose: Fully revert v9.0 multi-branch migration back to v8.6.2 state
-- When to use: If v9.0 deployment fails and needs full DB rollback
-- Time estimate: ~20-30 minutes (manual run in Supabase SQL Editor)
-- WARNING: Run code rollback (git revert) FIRST, then this SQL
--
-- Created: 2026-02-13
-- Reference: supabase-update-v9.0-multi-branch.sql lines 670-787
-- ============================================================

-- Run inside a transaction for safety
BEGIN;

-- ============================================================
-- STEP 1: Drop new RLS policies on branches
-- ============================================================
DROP POLICY IF EXISTS "branches_select_authenticated" ON public.branches;
DROP POLICY IF EXISTS "branches_select_anon_active" ON public.branches;
DROP POLICY IF EXISTS "branches_insert_super_admin" ON public.branches;
DROP POLICY IF EXISTS "branches_update_super_admin" ON public.branches;
DROP POLICY IF EXISTS "branches_delete_super_admin" ON public.branches;

-- ============================================================
-- STEP 2: Drop new RLS policies on profiles
-- ============================================================
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_super_admin" ON public.profiles;

-- ============================================================
-- STEP 3: Drop new RLS policies on receipts
-- ============================================================
DROP POLICY IF EXISTS "receipts_select" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update" ON public.receipts;
DROP POLICY IF EXISTS "receipts_delete" ON public.receipts;

-- ============================================================
-- STEP 4: Drop new RLS policies on card_print_locks
-- ============================================================
DROP POLICY IF EXISTS "card_print_locks_select" ON public.card_print_locks;
DROP POLICY IF EXISTS "card_print_locks_insert" ON public.card_print_locks;
DROP POLICY IF EXISTS "card_print_locks_update" ON public.card_print_locks;
DROP POLICY IF EXISTS "card_print_locks_delete" ON public.card_print_locks;

-- ============================================================
-- STEP 5: Drop new RLS policies on card_print_locks_archive
-- ============================================================
DROP POLICY IF EXISTS "card_print_locks_archive_select" ON public.card_print_locks_archive;

-- ============================================================
-- STEP 6: Drop new RLS policies on activity_logs
-- ============================================================
DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;

-- ============================================================
-- STEP 7: Drop new RLS policies on ux_analytics
-- ============================================================
DROP POLICY IF EXISTS "ux_analytics_select" ON public.ux_analytics;
DROP POLICY IF EXISTS "ux_analytics_insert" ON public.ux_analytics;

-- ============================================================
-- STEP 8: Restore OLD RLS policies (v8.6.2 state)
-- ============================================================

-- profiles (old)
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "Admin can update all profiles" ON public.profiles
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- receipts (old)
CREATE POLICY "Authenticated users can read receipts" ON public.receipts
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert receipts" ON public.receipts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update receipts" ON public.receipts
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can delete receipts" ON public.receipts
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- card_print_locks (old)
CREATE POLICY "Authenticated users can read card_print_locks" ON public.card_print_locks
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert card_print_locks" ON public.card_print_locks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own card_print_locks" ON public.card_print_locks
    FOR UPDATE USING (officer_id = auth.uid());
CREATE POLICY "Admin can delete card_print_locks" ON public.card_print_locks
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- card_print_locks_archive (old)
CREATE POLICY "Authenticated users can read card_print_locks_archive" ON public.card_print_locks_archive
    FOR SELECT USING (auth.role() = 'authenticated');

-- activity_logs (old)
CREATE POLICY "Authenticated users can insert activity_logs" ON public.activity_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read activity_logs" ON public.activity_logs
    FOR SELECT USING (auth.role() = 'authenticated');

-- ux_analytics (old)
CREATE POLICY "Authenticated users can insert ux_analytics" ON public.ux_analytics
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin can read ux_analytics" ON public.ux_analytics
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================================
-- STEP 9: Drop v9.0.1 RPC functions
-- (check_sn_duplicate and get_user_email added in v9.0.1)
-- ============================================================
DROP FUNCTION IF EXISTS public.check_sn_duplicate(text, text);
DROP FUNCTION IF EXISTS public.get_user_email(uuid);

-- ============================================================
-- STEP 10: Drop v9.0 helper functions
-- (NOTE: do NOT drop is_admin() — it existed before v9.0)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_branch_id();
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.is_branch_head();
DROP FUNCTION IF EXISTS public.update_branches_updated_at();

-- ============================================================
-- STEP 11: Drop new columns from tables
-- (branch_id, branch_role, is_super_admin)
-- ============================================================
ALTER TABLE public.profiles DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS branch_role;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_super_admin;
ALTER TABLE public.receipts DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.card_print_locks DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.card_print_locks_archive DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.activity_logs DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.ux_analytics DROP COLUMN IF EXISTS branch_id;

-- ============================================================
-- STEP 12: Drop indexes
-- ============================================================
DROP INDEX IF EXISTS idx_branches_code;
DROP INDEX IF EXISTS idx_profiles_branch_id;
DROP INDEX IF EXISTS idx_receipts_branch_id;
DROP INDEX IF EXISTS idx_receipts_branch_date;
DROP INDEX IF EXISTS idx_card_print_locks_branch_id;
DROP INDEX IF EXISTS idx_activity_logs_branch_id;

-- ============================================================
-- STEP 13: Drop trigger
-- ============================================================
DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;

-- ============================================================
-- STEP 14: Drop branches table (CASCADE removes FK references)
-- ============================================================
DROP TABLE IF EXISTS public.branches CASCADE;

-- ============================================================
-- STEP 15: Restore original handle_new_user() without branch support
-- ============================================================
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

-- ============================================================
-- STEP 16: Restore original cleanup_old_card_locks() without branch_id
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_card_locks()
RETURNS INTEGER AS $$
DECLARE
    moved_count INTEGER;
BEGIN
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

    DELETE FROM public.card_print_locks
    WHERE created_at < NOW() - INTERVAL '48 hours';

    DELETE FROM public.card_print_locks_archive
    WHERE archived_at < NOW() - INTERVAL '90 days';

    RETURN moved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ============================================================
-- VERIFICATION: Run after rollback to confirm v8.6.2 state
-- ============================================================
/*
-- Should return 0 (no branches table)
SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'branches';

-- Should return FALSE (no branch_id column in profiles)
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'branch_id'
);

-- Should return FALSE (no is_super_admin column in profiles)
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_super_admin'
);

-- Should return old policy names (not v9.0 names)
SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
SELECT policyname FROM pg_policies WHERE tablename = 'receipts';

-- Should be able to SELECT receipts normally
SELECT COUNT(*) FROM receipts;
SELECT COUNT(*) FROM profiles;
*/
