-- Repair legacy certifications.user_id NOT NULL constraint.
-- The app uses team_member_id + created_by; user_id is kept for compatibility.

ALTER TABLE certifications
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

-- Prefer created_by when user_id is null
UPDATE certifications
SET user_id = created_by
WHERE user_id IS NULL AND created_by IS NOT NULL;

-- Allow inserts that only set created_by (app will also set user_id)
ALTER TABLE certifications
ALTER COLUMN user_id DROP NOT NULL;
