-- Supabase Update for v7.0 - Photo Capture & E-Signature
-- Run this SQL in Supabase SQL Editor
-- ============================================================
-- Purpose: Add webcam photo capture and digital signature support
-- New columns: recipient_photo_url, recipient_signature_url,
--              officer_signature_url (receipts table)
--              signature_url (profiles table)
-- Workflow: Fill form → Capture photo → Sign → Save → Mark Received
-- ============================================================

-- 1. Add photo and signature columns to receipts table
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS recipient_photo_url TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS recipient_signature_url TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS officer_signature_url TEXT;

-- 2. Add officer signature column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- 3. Index for filtering signed/unsigned receipts
CREATE INDEX IF NOT EXISTS idx_receipts_signature_status
    ON public.receipts (recipient_signature_url, recipient_photo_url);

-- ============================================================
-- Verify columns were added:
-- Run: SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name = 'receipts'
--      AND column_name IN ('recipient_photo_url', 'recipient_signature_url', 'officer_signature_url');
--
-- Run: SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name = 'profiles' AND column_name = 'signature_url';
-- ============================================================
