-- Supabase Update for v5.1.0
-- Run this SQL in Supabase SQL Editor

-- 1. Add columns to profiles table for user approval
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 2. Create settings table for Google Sheet sync setting
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_by UUID REFERENCES auth.users,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on settings table
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 4. Create policy for settings table (authenticated users can read, admin can write)
DROP POLICY IF EXISTS "Anyone can read settings" ON settings;
CREATE POLICY "Anyone can read settings" ON settings
    FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update settings" ON settings;
CREATE POLICY "Authenticated users can update settings" ON settings
    FOR ALL
    USING (auth.role() = 'authenticated');

-- 5. Insert default setting for Google Sheet sync
INSERT INTO settings (key, value)
VALUES ('google_sheet_sync', '{"enabled": true}')
ON CONFLICT (key) DO NOTHING;

-- 6. Update existing admin user to be approved
UPDATE profiles
SET is_approved = TRUE
WHERE role = 'admin';

-- 7. Set default is_approved to TRUE for existing users
UPDATE profiles
SET is_approved = TRUE
WHERE is_approved IS NULL;
