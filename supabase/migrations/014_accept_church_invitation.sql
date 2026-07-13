-- =============================================================================
-- 014_accept_church_invitation.sql
-- Phase 8 — Accept invitation via SECURITY DEFINER RPC
-- Safe to re-run.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- True when an active membership exists for this church + email (auth.users).
CREATE OR REPLACE FUNCTION public.church_has_active_member_email(
  p_church_id uuid,
  p_email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.church_memberships m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.church_id = p_church_id
      AND m.status = 'active'::public.membership_status
      AND lower(trim(u.email)) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.church_has_active_member_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.church_has_active_member_email(uuid, text) TO authenticated;

-- Allow trusted RPCs to bypass membership mutation guards for invite acceptance
CREATE OR REPLACE FUNCTION public.enforce_membership_mutation_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_active_owners integer;
BEGIN
  IF current_setting('app.bypass_membership_guards', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: membership changes require a signed-in user';
  END IF;

  SELECT m.role::text
  INTO v_actor_role
  FROM public.church_memberships m
  WHERE m.user_id = v_actor
    AND m.church_id = COALESCE(NEW.church_id, OLD.church_id)
    AND m.status = 'active'::public.membership_status
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id = v_actor
       AND NEW.role::text = 'owner'
       AND NEW.status = 'active'::public.membership_status
       AND NOT EXISTS (
         SELECT 1
         FROM public.church_memberships m
         WHERE m.church_id = NEW.church_id
       ) THEN
      RETURN NEW;
    END IF;

    IF NOT public.can_manage_memberships(NEW.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot create memberships for this church';
    END IF;

    IF NEW.user_id = v_actor THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot create your own membership row';
    END IF;

    IF NEW.role::text = 'owner' AND v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can assign the owner role';
    END IF;

    IF v_actor_role = 'security_leader'
       AND public.membership_role_rank(NEW.role::text)
         >= public.membership_role_rank('security_leader') THEN
      RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.can_manage_memberships(OLD.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot update memberships for this church';
    END IF;

    IF NEW.church_id IS DISTINCT FROM OLD.church_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot reassign membership identity fields';
    END IF;

    IF OLD.user_id = v_actor
       AND (
         NEW.role IS DISTINCT FROM OLD.role
         OR NEW.status IS DISTINCT FROM OLD.status
       ) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot change your own membership role or status';
    END IF;

    IF NEW.role::text = 'owner'
       AND OLD.role::text IS DISTINCT FROM 'owner'
       AND v_actor_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can assign the owner role';
    END IF;

    IF v_actor_role = 'security_leader' THEN
      IF OLD.role::text IN ('owner', 'administrator', 'security_leader') THEN
        RAISE EXCEPTION 'FORBIDDEN: security leaders cannot modify this membership';
      END IF;
      IF NEW.role::text = 'owner'
         OR public.membership_role_rank(NEW.role::text)
              >= public.membership_role_rank('security_leader') THEN
        RAISE EXCEPTION 'FORBIDDEN: security leaders may only assign security_member or viewer';
      END IF;
    END IF;

    IF v_actor_role = 'administrator' AND OLD.role::text = 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: administrators cannot modify owner memberships';
    END IF;

    IF OLD.role::text = 'owner'
       AND OLD.status = 'active'::public.membership_status
       AND (
         NEW.role::text IS DISTINCT FROM 'owner'
         OR NEW.status IS DISTINCT FROM 'active'::public.membership_status
       ) THEN
      SELECT COUNT(*)::integer
      INTO v_active_owners
      FROM public.church_memberships m
      WHERE m.church_id = OLD.church_id
        AND m.role = 'owner'::public.membership_role
        AND m.status = 'active'::public.membership_status;

      IF v_active_owners <= 1 THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot remove or demote the last active owner';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.can_manage_memberships(OLD.church_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot delete memberships for this church';
    END IF;

    IF OLD.user_id = v_actor THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot delete your own membership';
    END IF;

    IF v_actor_role IS DISTINCT FROM 'owner' AND OLD.role::text = 'owner' THEN
      RAISE EXCEPTION 'FORBIDDEN: only an owner can remove an owner membership';
    END IF;

    IF OLD.role::text = 'owner'
       AND OLD.status = 'active'::public.membership_status THEN
      SELECT COUNT(*)::integer
      INTO v_active_owners
      FROM public.church_memberships m
      WHERE m.church_id = OLD.church_id
        AND m.role = 'owner'::public.membership_role
        AND m.status = 'active'::public.membership_status;

      IF v_active_owners <= 1 THEN
        RAISE EXCEPTION 'FORBIDDEN: cannot remove the last active owner';
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_church_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- Already a member: mark invite accepted and return
    UPDATE public.church_invitations
    SET accepted_at = v_now
    WHERE id = v_invite.id;

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
      church_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at,
      created_at,
      updated_at
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
    church_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    v_invite.church_id,
    v_user_id,
    'membership.invitation_accepted',
    'church_invitation',
    v_invite.id,
    jsonb_build_object(
      'membership_id', v_membership_id,
      'role', v_invite.role::text,
      'email', lower(trim(v_invite.email))
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
