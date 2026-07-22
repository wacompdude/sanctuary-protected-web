-- =============================================================================
-- 037_email_sender_snapshots.sql
-- Additive: store outbound email sender snapshot on notification_deliveries.
-- Optional template default_sender_category for later phases.
-- Safe to re-run. Review before applying to production Supabase.
--
-- APPLY AFTER: 027 (notifications), ideally 036 already applied.
-- Does not rewrite provider_message_id or delivery status history.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Delivery sender snapshot (nullable first; backfill historical email rows)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS sender_category text;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS from_name text;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS from_address text;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS reply_to_address text;

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_sender_category_check;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_sender_category_check
  CHECK (
    sender_category IS NULL
    OR sender_category IN (
      'alerts',
      'no_reply',
      'info',
      'emergency',
      'incidents',
      'access',
      'support',
      'billing',
      'hardware'
    )
  );

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_from_name_length_check;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_from_name_length_check
  CHECK (from_name IS NULL OR char_length(from_name) BETWEEN 1 AND 120);

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_from_address_length_check;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_from_address_length_check
  CHECK (from_address IS NULL OR char_length(from_address) BETWEEN 3 AND 254);

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_reply_to_address_length_check;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_reply_to_address_length_check
  CHECK (
    reply_to_address IS NULL
    OR char_length(reply_to_address) BETWEEN 3 AND 254
  );

CREATE INDEX IF NOT EXISTS notification_deliveries_sender_category_idx
  ON public.notification_deliveries (church_id, sender_category, created_at DESC)
  WHERE sender_category IS NOT NULL;

-- Backfill historical email deliveries as the former single alerts sender.
UPDATE public.notification_deliveries
SET
  sender_category = COALESCE(sender_category, 'alerts'),
  from_name = COALESCE(from_name, 'Sanctuary Protected Alerts'),
  from_address = COALESCE(from_address, 'alerts@sanctuaryprotected.com')
WHERE channel = 'email'
  AND (
    sender_category IS NULL
    OR from_address IS NULL
    OR from_name IS NULL
  );

-- ---------------------------------------------------------------------------
-- Template default sender category (nullable; validated in app)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS default_sender_category text;

ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_default_sender_category_check;

ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_default_sender_category_check
  CHECK (
    default_sender_category IS NULL
    OR default_sender_category IN (
      'alerts',
      'no_reply',
      'info',
      'emergency',
      'incidents',
      'access',
      'support',
      'billing',
      'hardware'
    )
  );

COMMENT ON COLUMN public.notification_deliveries.sender_category IS
  'Controlled EmailSenderCategory used when the message was sent.';
COMMENT ON COLUMN public.notification_deliveries.from_address IS
  'Snapshot of the From address at send time (historical accuracy).';
COMMENT ON COLUMN public.notification_templates.default_sender_category IS
  'Optional template hint; notification-type rules still take precedence.';
