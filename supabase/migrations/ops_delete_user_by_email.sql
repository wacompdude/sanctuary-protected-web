-- =============================================================================
-- ops_delete_user_by_email.sql
--
-- MANUAL OPERATIONS SCRIPT — do not apply as a normal migration.
-- Run in the Supabase SQL Editor after setting v_email below.
--
-- Removes an auth account and cleans related application rows.
--
-- Behavior:
--   1. Resolve auth.users by email (case-insensitive).
--   2. Refuse if the user is the last active owner of any church
--      (unless v_force_delete_owned_churches := true).
--   3. Delete invitations they sent or that were sent to their email.
--   4. Soft-clean / reassign / delete rows that reference the user.
--   5. Delete church_memberships (bypassing membership mutation guards).
--   6. Delete public.profiles (also cascades from auth.users).
--   7. Delete auth.users (cascades / SET NULL remaining FKs).
--
-- Does NOT store or require passwords/tokens.
-- Audit log rows are retained with user_id set to NULL (append-only table).
-- =============================================================================

DO $$
DECLARE
  -- >>> EDIT THIS <<<
  v_email text := 'REPLACE_WITH_USER_EMAIL';

  -- When true, churches where this user is the sole active owner are deleted.
  v_force_delete_owned_churches boolean := false;

  v_user_id uuid;
  v_normalized_email text;
  v_sole_owner_church record;
  v_reassign_to uuid;
  v_incident record;
BEGIN
  v_normalized_email := lower(trim(both from coalesce(v_email, '')));

  IF v_normalized_email = '' OR v_normalized_email = 'replace_with_user_email' THEN
    RAISE EXCEPTION
      'Set v_email to the account email before running (e.g. user@example.com).';
  END IF;

  SELECT u.id
  INTO v_user_id
  FROM auth.users u
  WHERE lower(trim(both from u.email)) = v_normalized_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row found for email: %', v_normalized_email;
  END IF;

  RAISE NOTICE 'Deleting account % (user_id=%)', v_normalized_email, v_user_id;

  -- Bypass membership mutation trigger (self-delete / last-owner guards)
  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  -- ---------------------------------------------------------------------------
  -- Last-owner safety
  -- ---------------------------------------------------------------------------
  FOR v_sole_owner_church IN
    SELECT m.church_id, c.name AS church_name
    FROM public.church_memberships m
    JOIN public.churches c ON c.id = m.church_id
    WHERE m.user_id = v_user_id
      AND m.role = 'owner'::public.membership_role
      AND m.status = 'active'::public.membership_status
      AND (
        SELECT COUNT(*)::integer
        FROM public.church_memberships o
        WHERE o.church_id = m.church_id
          AND o.role = 'owner'::public.membership_role
          AND o.status = 'active'::public.membership_status
      ) = 1
  LOOP
    IF NOT v_force_delete_owned_churches THEN
      RAISE EXCEPTION
        'User is the last active owner of church "%" (%). Transfer ownership first, or set v_force_delete_owned_churches := true to delete that church.',
        v_sole_owner_church.church_name,
        v_sole_owner_church.church_id;
    END IF;

    RAISE NOTICE 'Force-deleting sole-owned church % (%)',
      v_sole_owner_church.church_name,
      v_sole_owner_church.church_id;

    -- Clear church-scoped operational data before removing the church
    -- (incident FKs may be RESTRICT).
    DELETE FROM public.incident_updates
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.incidents
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.events
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.certifications
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.team_members
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.church_invitations
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.campuses
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.church_memberships
    WHERE church_id = v_sole_owner_church.church_id;

    ALTER TABLE public.audit_logs DISABLE TRIGGER USER;
    DELETE FROM public.audit_logs
    WHERE church_id = v_sole_owner_church.church_id;
    ALTER TABLE public.audit_logs ENABLE TRIGGER USER;

    DELETE FROM public.churches
    WHERE id = v_sole_owner_church.church_id;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Invitations (invited_by is NOT NULL + ON DELETE RESTRICT)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.church_invitations
  WHERE invited_by = v_user_id
     OR lower(trim(both from email)) = v_normalized_email;

  -- ---------------------------------------------------------------------------
  -- Incidents (created_by is NOT NULL + ON DELETE RESTRICT)
  -- Prefer reassignment to another active member of the same church.
  -- ---------------------------------------------------------------------------
  FOR v_incident IN
    SELECT i.id, i.church_id
    FROM public.incidents i
    WHERE i.created_by = v_user_id
  LOOP
    SELECT m.user_id
    INTO v_reassign_to
    FROM public.church_memberships m
    WHERE m.church_id = v_incident.church_id
      AND m.user_id <> v_user_id
      AND m.status = 'active'::public.membership_status
    ORDER BY
      CASE m.role::text
        WHEN 'owner' THEN 1
        WHEN 'administrator' THEN 2
        ELSE 3
      END,
      COALESCE(m.joined_at, m.created_at)
    LIMIT 1;

    IF v_reassign_to IS NOT NULL THEN
      UPDATE public.incident_updates
      SET created_by = v_reassign_to
      WHERE created_by = v_user_id
        AND incident_id = v_incident.id;

      UPDATE public.incidents
      SET created_by = v_reassign_to
      WHERE id = v_incident.id;
    ELSE
      DELETE FROM public.incident_updates WHERE incident_id = v_incident.id;
      DELETE FROM public.incidents WHERE id = v_incident.id;
    END IF;
  END LOOP;

  -- Any remaining updates authored by this user on others' incidents
  UPDATE public.incident_updates iu
  SET created_by = i.created_by
  FROM public.incidents i
  WHERE iu.incident_id = i.id
    AND iu.created_by = v_user_id
    AND i.created_by <> v_user_id;

  DELETE FROM public.incident_updates WHERE created_by = v_user_id;

  -- ---------------------------------------------------------------------------
  -- Nullable user references
  -- ---------------------------------------------------------------------------
  UPDATE public.events
  SET acknowledged_by = NULL
  WHERE acknowledged_by = v_user_id;

  UPDATE public.team_members
  SET created_by = NULL
  WHERE created_by = v_user_id;

  UPDATE public.certifications
  SET
    created_by = NULL,
    user_id = NULL
  WHERE created_by = v_user_id
     OR user_id = v_user_id;

  -- Keep audit history; null the actor (also happens via ON DELETE SET NULL)
  -- Must disable append-only triggers to update/delete audit rows.
  ALTER TABLE public.audit_logs DISABLE TRIGGER USER;

  UPDATE public.audit_logs
  SET user_id = NULL
  WHERE user_id = v_user_id;

  -- Optional: remove auth.login rows that only referenced this user
  -- DELETE FROM public.audit_logs WHERE user_id IS NULL AND action LIKE 'auth.%';

  ALTER TABLE public.audit_logs ENABLE TRIGGER USER;

  -- ---------------------------------------------------------------------------
  -- Memberships
  -- ---------------------------------------------------------------------------
  DELETE FROM public.church_memberships
  WHERE user_id = v_user_id;

  -- ---------------------------------------------------------------------------
  -- Profile + auth user
  -- ---------------------------------------------------------------------------
  DELETE FROM public.profiles
  WHERE id = v_user_id;

  DELETE FROM auth.users
  WHERE id = v_user_id;

  RAISE NOTICE 'Successfully deleted account for %', v_normalized_email;
END $$;

-- Verify (should return 0 rows):
-- SELECT id, email FROM auth.users WHERE lower(email) = lower('REPLACE_WITH_USER_EMAIL');
-- SELECT * FROM public.profiles WHERE id = 'PASTE_USER_ID_IF_NEEDED';
-- SELECT * FROM public.church_memberships WHERE user_id = 'PASTE_USER_ID_IF_NEEDED';
