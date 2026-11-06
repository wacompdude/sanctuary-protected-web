-- Stage 3D local harness: stub platform deps, apply 118, verify JWT access.
-- Safe for local Supabase only. Not a Production migration.

CREATE TABLE IF NOT EXISTS public.platform_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.platform_permissions (
  permission_key text PRIMARY KEY,
  display_name text,
  description text,
  category text,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.platform_roles (
  role_key text PRIMARY KEY,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  role_key text,
  permission_key text,
  PRIMARY KEY (role_key, permission_key)
);

CREATE OR REPLACE FUNCTION public.seed_platform_permission(
  p_key text,
  p_name text,
  p_description text,
  p_category text
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.platform_permissions(permission_key, display_name, description, category, status)
  VALUES (p_key, p_name, p_description, p_category, 'active')
  ON CONFLICT (permission_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_platform_role_permission(
  p_role text,
  p_permission text
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.platform_roles(role_key, status)
  VALUES (p_role, 'active')
  ON CONFLICT (role_key) DO NOTHING;
  INSERT INTO public.platform_role_permissions(role_key, permission_key)
  VALUES (p_role, p_permission)
  ON CONFLICT DO NOTHING;
END;
$$;

-- organizations may already exist from local fixture
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);
