-- =============================================================================
-- 016_audit_logging.sql
-- Phase 11 — Tighten audit log access; allow auth.* events without church_id
-- Align accept-invitation action name. Safe to re-run.
-- =============================================================================

-- Auth login events may omit church_id; other inserts still require membership.
DROP POLICY IF EXISTS "Members can insert audit logs" ON public.audit_logs;
CREATE POLICY "Members can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (
        church_id IS NOT NULL
        AND public.is_active_church_member(church_id)
      )
      OR (
        church_id IS NULL
        AND action LIKE 'auth.%'
      )
    )
  );

-- Read access for administrators and owners only (nav is not authorization).
DROP POLICY IF EXISTS "Members can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    church_id IS NOT NULL
    AND public.has_church_role(
      church_id,
      ARRAY['owner', 'administrator']
    )
  );

-- Keep append-only grants
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- Prefer canonical invitation.accepted action going forward
CREATE OR REPLACE FUNCTION public.accept_church_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_token_hash text;
  v_invite public.church_invitations%ROWTYPE;
  v_membership_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sign in to accept this invitation';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'VALIDATION: invalid invitation token';
  END IF;

  v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT *
  INTO v_invite
  FROM public.church_invitations
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: invitation not found';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'REVOKED: this invitation has been revoked';
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ACCEPTED: this invitation has already been accepted';
  END IF;

  IF v_invite.expires_at <= v_now THEN
    RAISE EXCEPTION 'EXPIRED: this invitation has expired';
  END IF;

  SELECT lower(trim(u.email))
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email IS NULL OR v_user_email <> lower(trim(v_invite.email)) THEN
    RAISE EXCEPTION 'EMAIL_MISMATCH: sign in with the invited email address (%)',
      v_invite.email;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.church_memberships m
    WHERE m.church_id = v_invite.church_id
      AND m.user_id = v_user_id
      AND m.status = 'active'::public.membership_status
  ) THEN
    UPDATE public.church_invitations
    SET accepted_at = v_now
    WHERE id = v_invite.id;

    INSERT INTO public.audit_logs (
      church_id, user_id, action, entity_type, entity_id, metadata, created_at
    ) VALUES (
      v_invite.church_id,
      v_user_id,
      'invitation.accepted',
      'church_invitation',
      v_invite.id,
      jsonb_build_object(
        'already_member', true,
        'role', v_invite.role::text,
        'email', lower(trim(v_invite.email))
      ),
      v_now
    );

    RETURN jsonb_build_object(
      'church_id', v_invite.church_id,
      'already_member', true
    );
  END IF;

  PERFORM set_config('app.bypass_membership_guards', 'on', true);

  SELECT m.id
  INTO v_membership_id
  FROM public.church_memberships m
  WHERE m.church_id = v_invite.church_id
    AND m.user_id = v_user_id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    INSERT INTO public.church_memberships (
      church_id, user_id, role, status, invited_by, joined_at, created_at, updated_at
    ) VALUES (
      v_invite.church_id,
      v_user_id,
      v_invite.role,
      'active'::public.membership_status,
      v_invite.invited_by,
      v_now,
      v_now,
      v_now
    )
    RETURNING id INTO v_membership_id;
  ELSE
    UPDATE public.church_memberships
    SET
      role = v_invite.role,
      status = 'active'::public.membership_status,
      invited_by = COALESCE(invited_by, v_invite.invited_by),
      joined_at = COALESCE(joined_at, v_now),
      updated_at = v_now
    WHERE id = v_membership_id;
  END IF;

  UPDATE public.church_invitations
  SET accepted_at = v_now
  WHERE id = v_invite.id;

  INSERT INTO public.audit_logs (
    church_id, user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    v_invite.church_id,
    v_user_id,
    'invitation.accepted',
    'church_invitation',
    v_invite.id,
    jsonb_build_object(
      'membership_id', v_membership_id,
      'role', v_invite.role::text,
      'email', lower(trim(v_invite.email)),
      'already_member', false
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'church_id', v_invite.church_id,
    'membership_id', v_membership_id,
    'role', v_invite.role::text,
    'already_member', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_church_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_church_invitation(text) TO authenticated;
