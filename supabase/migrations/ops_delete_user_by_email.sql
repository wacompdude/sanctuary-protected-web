-- =============================================================================
-- ops_delete_user_by_email.sql
--
-- MANUAL OPERATIONS SCRIPT — do not apply as a normal migration.
-- Run in the Supabase SQL Editor after setting v_email below.
--
-- Removes an auth account and cleans related application rows that would
-- otherwise block DELETE (ON DELETE RESTRICT / NO ACTION NOT NULL FKs).
--
-- Behavior:
--   1. Resolve auth.users by email (case-insensitive).
--   2. Refuse if the user is the last active owner of any church
--      (unless v_force_delete_owned_churches := true).
--   3. Delete invitations they sent or that were sent to their email.
--   4. Reassign or delete rows that reference the user with RESTRICT / NOT NULL.
--   5. Soft-clean nullable SET NULL references (optional hygiene).
--   6. Delete church_memberships (bypassing membership mutation guards).
--   7. Delete public.profiles + storage avatar objects.
--   8. Delete auth.users (cascades / SET NULL remaining FKs).
--
-- Does NOT store or require passwords/tokens.
-- Audit log rows are retained with user_id set to NULL (append-only table).
-- Storage objects for incident/equipment/policy media uploaded by this user
-- are left in place when rows are reassigned; orphaned when rows are deleted.
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
  v_church_id uuid;
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

    -- Clear RESTRICT parents before deleting the church.
    -- Newer church-scoped tables mostly CASCADE from churches; these do not.

    DELETE FROM public.incident_updates
    WHERE church_id = v_sole_owner_church.church_id;

    -- Cascades incident_attachments + incident_team_members via incident_id
    DELETE FROM public.incidents
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.events
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.certifications
    WHERE church_id = v_sole_owner_church.church_id;

    DELETE FROM public.team_members
    WHERE church_id = v_sole_owner_church.church_id;

    -- medical_supply_usage RESTRICT → medical_supplies; clear before church CASCADE
    IF to_regclass('public.medical_supply_usage') IS NOT NULL THEN
      DELETE FROM public.medical_supply_usage
      WHERE church_id = v_sole_owner_church.church_id;
    END IF;

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

    -- Remaining church-scoped rows (notifications, equipment, policies,
    -- threat levels, contacts, medical supplies, etc.) CASCADE from churches.
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
  -- Incident team members
  --   membership_id → church_memberships ON DELETE RESTRICT
  --   added_by → auth.users ON DELETE RESTRICT
  -- Must clear before membership / auth delete.
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.incident_team_members') IS NOT NULL THEN
    DELETE FROM public.incident_team_members
    WHERE membership_id IN (
      SELECT m.id
      FROM public.church_memberships m
      WHERE m.user_id = v_user_id
    );

    -- Reassign "added_by" on remaining rows, else delete
    FOR v_church_id IN
      SELECT DISTINCT church_id
      FROM public.incident_team_members
      WHERE added_by = v_user_id
    LOOP
      v_reassign_to := NULL;
      SELECT m.user_id
      INTO v_reassign_to
      FROM public.church_memberships m
      WHERE m.church_id = v_church_id
        AND m.user_id <> v_user_id
        AND m.status = 'active'::public.membership_status
      ORDER BY
        CASE m.role::text
          WHEN 'owner' THEN 1
          WHEN 'co_owner' THEN 2
          WHEN 'administrator' THEN 3
          ELSE 4
        END,
        COALESCE(m.joined_at, m.created_at)
      LIMIT 1;

      IF v_reassign_to IS NOT NULL THEN
        UPDATE public.incident_team_members
        SET added_by = v_reassign_to
        WHERE added_by = v_user_id
          AND church_id = v_church_id;
      ELSE
        DELETE FROM public.incident_team_members
        WHERE added_by = v_user_id
          AND church_id = v_church_id;
      END IF;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Incidents (created_by is NOT NULL + ON DELETE RESTRICT)
  -- Prefer reassignment to another active member of the same church.
  -- ---------------------------------------------------------------------------
  FOR v_incident IN
    SELECT i.id, i.church_id
    FROM public.incidents i
    WHERE i.created_by = v_user_id
  LOOP
    v_reassign_to := NULL;
    SELECT m.user_id
    INTO v_reassign_to
    FROM public.church_memberships m
    WHERE m.church_id = v_incident.church_id
      AND m.user_id <> v_user_id
      AND m.status = 'active'::public.membership_status
    ORDER BY
      CASE m.role::text
        WHEN 'owner' THEN 1
        WHEN 'co_owner' THEN 2
        WHEN 'administrator' THEN 3
        ELSE 4
      END,
      COALESCE(m.joined_at, m.created_at)
    LIMIT 1;

    IF v_reassign_to IS NOT NULL THEN
      UPDATE public.incident_updates
      SET created_by = v_reassign_to
      WHERE created_by = v_user_id
        AND incident_id = v_incident.id;

      IF to_regclass('public.incident_attachments') IS NOT NULL THEN
        UPDATE public.incident_attachments
        SET uploaded_by = v_reassign_to
        WHERE uploaded_by = v_user_id
          AND incident_id = v_incident.id;
      END IF;

      UPDATE public.incidents
      SET created_by = v_reassign_to
      WHERE id = v_incident.id;
    ELSE
      DELETE FROM public.incident_updates WHERE incident_id = v_incident.id;
      IF to_regclass('public.incident_attachments') IS NOT NULL THEN
        DELETE FROM public.incident_attachments WHERE incident_id = v_incident.id;
      END IF;
      IF to_regclass('public.incident_team_members') IS NOT NULL THEN
        DELETE FROM public.incident_team_members WHERE incident_id = v_incident.id;
      END IF;
      DELETE FROM public.incidents WHERE id = v_incident.id;
    END IF;
  END LOOP;

  -- Updates authored by this user on others' incidents
  UPDATE public.incident_updates iu
  SET created_by = i.created_by
  FROM public.incidents i
  WHERE iu.incident_id = i.id
    AND iu.created_by = v_user_id
    AND i.created_by <> v_user_id;

  DELETE FROM public.incident_updates WHERE created_by = v_user_id;

  -- Remaining incident attachments uploaded by this user
  IF to_regclass('public.incident_attachments') IS NOT NULL THEN
    FOR v_church_id IN
      SELECT DISTINCT church_id
      FROM public.incident_attachments
      WHERE uploaded_by = v_user_id
    LOOP
      v_reassign_to := NULL;
      SELECT m.user_id
      INTO v_reassign_to
      FROM public.church_memberships m
      WHERE m.church_id = v_church_id
        AND m.user_id <> v_user_id
        AND m.status = 'active'::public.membership_status
      ORDER BY
        CASE m.role::text
          WHEN 'owner' THEN 1
          WHEN 'co_owner' THEN 2
          WHEN 'administrator' THEN 3
          ELSE 4
        END,
        COALESCE(m.joined_at, m.created_at)
      LIMIT 1;

      IF v_reassign_to IS NOT NULL THEN
        UPDATE public.incident_attachments
        SET uploaded_by = v_reassign_to
        WHERE uploaded_by = v_user_id
          AND church_id = v_church_id;
      ELSE
        DELETE FROM public.incident_attachments
        WHERE uploaded_by = v_user_id
          AND church_id = v_church_id;
      END IF;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Church threat levels (changed_by NOT NULL + ON DELETE RESTRICT)
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.church_threat_levels') IS NOT NULL THEN
    FOR v_church_id IN
      SELECT DISTINCT church_id
      FROM public.church_threat_levels
      WHERE changed_by = v_user_id
    LOOP
      v_reassign_to := NULL;
      SELECT m.user_id
      INTO v_reassign_to
      FROM public.church_memberships m
      WHERE m.church_id = v_church_id
        AND m.user_id <> v_user_id
        AND m.status = 'active'::public.membership_status
      ORDER BY
        CASE m.role::text
          WHEN 'owner' THEN 1
          WHEN 'co_owner' THEN 2
          WHEN 'administrator' THEN 3
          ELSE 4
        END,
        COALESCE(m.joined_at, m.created_at)
      LIMIT 1;

      IF v_reassign_to IS NOT NULL THEN
        UPDATE public.church_threat_levels
        SET changed_by = v_reassign_to
        WHERE changed_by = v_user_id
          AND church_id = v_church_id;
      ELSE
        DELETE FROM public.church_threat_levels
        WHERE changed_by = v_user_id
          AND church_id = v_church_id;
      END IF;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Equipment attachments (uploaded_by NOT NULL + NO ACTION)
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.equipment_attachments') IS NOT NULL THEN
    FOR v_church_id IN
      SELECT DISTINCT church_id
      FROM public.equipment_attachments
      WHERE uploaded_by = v_user_id
    LOOP
      v_reassign_to := NULL;
      SELECT m.user_id
      INTO v_reassign_to
      FROM public.church_memberships m
      WHERE m.church_id = v_church_id
        AND m.user_id <> v_user_id
        AND m.status = 'active'::public.membership_status
      ORDER BY
        CASE m.role::text
          WHEN 'owner' THEN 1
          WHEN 'co_owner' THEN 2
          WHEN 'administrator' THEN 3
          ELSE 4
        END,
        COALESCE(m.joined_at, m.created_at)
      LIMIT 1;

      IF v_reassign_to IS NOT NULL THEN
        UPDATE public.equipment_attachments
        SET uploaded_by = v_reassign_to
        WHERE uploaded_by = v_user_id
          AND church_id = v_church_id;
      ELSE
        DELETE FROM public.equipment_attachments
        WHERE uploaded_by = v_user_id
          AND church_id = v_church_id;
      END IF;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Policy attachments + approvals (uploaded_by / actor_user_id NOT NULL)
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.policy_attachments') IS NOT NULL THEN
    FOR v_church_id IN
      SELECT DISTINCT church_id
      FROM public.policy_attachments
      WHERE uploaded_by = v_user_id
    LOOP
      v_reassign_to := NULL;
      SELECT m.user_id
      INTO v_reassign_to
      FROM public.church_memberships m
      WHERE m.church_id = v_church_id
        AND m.user_id <> v_user_id
        AND m.status = 'active'::public.membership_status
      ORDER BY
        CASE m.role::text
          WHEN 'owner' THEN 1
          WHEN 'co_owner' THEN 2
          WHEN 'administrator' THEN 3
          ELSE 4
        END,
        COALESCE(m.joined_at, m.created_at)
      LIMIT 1;

      IF v_reassign_to IS NOT NULL THEN
        UPDATE public.policy_attachments
        SET uploaded_by = v_reassign_to
        WHERE uploaded_by = v_user_id
          AND church_id = v_church_id;
      ELSE
        DELETE FROM public.policy_attachments
        WHERE uploaded_by = v_user_id
          AND church_id = v_church_id;
      END IF;
    END LOOP;
  END IF;

  IF to_regclass('public.policy_approvals') IS NOT NULL THEN
    FOR v_church_id IN
      SELECT DISTINCT church_id
      FROM public.policy_approvals
      WHERE actor_user_id = v_user_id
    LOOP
      v_reassign_to := NULL;
      SELECT m.user_id
      INTO v_reassign_to
      FROM public.church_memberships m
      WHERE m.church_id = v_church_id
        AND m.user_id <> v_user_id
        AND m.status = 'active'::public.membership_status
      ORDER BY
        CASE m.role::text
          WHEN 'owner' THEN 1
          WHEN 'co_owner' THEN 2
          WHEN 'administrator' THEN 3
          ELSE 4
        END,
        COALESCE(m.joined_at, m.created_at)
      LIMIT 1;

      IF v_reassign_to IS NOT NULL THEN
        UPDATE public.policy_approvals
        SET actor_user_id = v_reassign_to
        WHERE actor_user_id = v_user_id
          AND church_id = v_church_id;
      ELSE
        DELETE FROM public.policy_approvals
        WHERE actor_user_id = v_user_id
          AND church_id = v_church_id;
      END IF;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Nullable user references (hygiene; also handled by ON DELETE SET NULL)
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
  ALTER TABLE public.audit_logs DISABLE TRIGGER USER;

  UPDATE public.audit_logs
  SET user_id = NULL
  WHERE user_id = v_user_id;

  ALTER TABLE public.audit_logs ENABLE TRIGGER USER;

  -- ---------------------------------------------------------------------------
  -- Memberships (CASCADE from auth.users also removes these; explicit for clarity)
  -- ---------------------------------------------------------------------------
  DELETE FROM public.church_memberships
  WHERE user_id = v_user_id;

  -- ---------------------------------------------------------------------------
  -- Profile avatar storage + profile + auth user
  -- ---------------------------------------------------------------------------
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'profile-avatars'
      AND name LIKE ('users/' || v_user_id::text || '/%');
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'storage.objects not available; skipped avatar cleanup';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'No privilege to delete storage.objects; skipped avatar cleanup';
  END;

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
