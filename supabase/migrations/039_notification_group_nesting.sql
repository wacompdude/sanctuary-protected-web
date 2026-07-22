-- =============================================================================
-- 039_notification_group_nesting.sql
-- True nested notification groups (group-to-group membership).
-- Additive / non-destructive. Safe to re-run.
-- Review before applying to production Supabase.
--
-- Does NOT delete or rewrite existing notification_group_members rows.
-- Flattened "bulk add by role" history cannot be auto-converted safely
-- (no provenance). Admins nest groups going forward and may clean directs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------

-- Application and DB validators share this depth cap.
CREATE OR REPLACE FUNCTION public.notification_group_max_nesting_depth()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 10;
$$;

REVOKE ALL ON FUNCTION public.notification_group_max_nesting_depth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_group_max_nesting_depth()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- notification_group_nestings
-- parent_group_id contains child_group_id
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_group_nestings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches (id) ON DELETE CASCADE,
  parent_group_id uuid NOT NULL
    REFERENCES public.notification_groups (id) ON DELETE CASCADE,
  child_group_id uuid NOT NULL
    REFERENCES public.notification_groups (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  added_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_group_nestings_status_check
    CHECK (status IN ('active', 'removed')),
  CONSTRAINT notification_group_nestings_no_self_check
    CHECK (parent_group_id <> child_group_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_group_nestings_active_unique_idx
  ON public.notification_group_nestings (
    church_id,
    parent_group_id,
    child_group_id
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS notification_group_nestings_parent_idx
  ON public.notification_group_nestings (parent_group_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS notification_group_nestings_child_idx
  ON public.notification_group_nestings (child_group_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS notification_group_nestings_church_parent_idx
  ON public.notification_group_nestings (church_id, parent_group_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS notification_group_nestings_church_child_idx
  ON public.notification_group_nestings (church_id, child_group_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Cycle + same-church + depth + parent-manageability validators
-- ---------------------------------------------------------------------------

-- True when adding parent → child would create a cycle
-- (parent is already reachable as a descendant of child).
CREATE OR REPLACE FUNCTION public.notification_group_nesting_would_cycle(
  p_church_id uuid,
  p_parent_group_id uuid,
  p_child_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE descendants AS (
    SELECT
      n.child_group_id AS group_id,
      1 AS depth
    FROM public.notification_group_nestings n
    WHERE n.church_id = p_church_id
      AND n.parent_group_id = p_child_group_id
      AND n.status = 'active'

    UNION ALL

    SELECT
      n.child_group_id,
      d.depth + 1
    FROM descendants d
    JOIN public.notification_group_nestings n
      ON n.church_id = p_church_id
     AND n.parent_group_id = d.group_id
     AND n.status = 'active'
    WHERE d.depth < public.notification_group_max_nesting_depth()
  )
  SELECT EXISTS (
    SELECT 1
    FROM descendants
    WHERE group_id = p_parent_group_id
  )
  OR p_parent_group_id = p_child_group_id;
$$;

REVOKE ALL ON FUNCTION public.notification_group_nesting_would_cycle(uuid, uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_group_nesting_would_cycle(uuid, uuid, uuid)
  TO authenticated, service_role;

-- Depth of deepest descendant chain under a group (0 if none).
CREATE OR REPLACE FUNCTION public.notification_group_nesting_subtree_depth(
  p_church_id uuid,
  p_root_group_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE descendants AS (
    SELECT
      n.child_group_id AS group_id,
      1 AS depth
    FROM public.notification_group_nestings n
    WHERE n.church_id = p_church_id
      AND n.parent_group_id = p_root_group_id
      AND n.status = 'active'

    UNION ALL

    SELECT
      n.child_group_id,
      d.depth + 1
    FROM descendants d
    JOIN public.notification_group_nestings n
      ON n.church_id = p_church_id
     AND n.parent_group_id = d.group_id
     AND n.status = 'active'
    WHERE d.depth < public.notification_group_max_nesting_depth() + 1
  )
  SELECT COALESCE(MAX(depth), 0) FROM descendants;
$$;

REVOKE ALL ON FUNCTION public.notification_group_nesting_subtree_depth(uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_group_nesting_subtree_depth(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_notification_group_nesting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.notification_groups%ROWTYPE;
  child_row public.notification_groups%ROWTYPE;
  parent_depth_from_roots integer;
  child_subtree_depth integer;
  resulting_depth integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_group_id = NEW.child_group_id THEN
    RAISE EXCEPTION
      'VALIDATION: This group cannot be added because it would create a circular group relationship.';
  END IF;

  SELECT * INTO parent_row
  FROM public.notification_groups
  WHERE id = NEW.parent_group_id;

  SELECT * INTO child_row
  FROM public.notification_groups
  WHERE id = NEW.child_group_id;

  IF parent_row.id IS NULL OR child_row.id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION: Parent or child group was not found.';
  END IF;

  IF parent_row.church_id <> NEW.church_id
     OR child_row.church_id <> NEW.church_id
     OR parent_row.church_id <> child_row.church_id THEN
    RAISE EXCEPTION 'VALIDATION: Nested groups must belong to the same church.';
  END IF;

  IF parent_row.status = 'archived' THEN
    RAISE EXCEPTION 'VALIDATION: Cannot add nested groups to an archived parent group.';
  END IF;

  IF child_row.status = 'archived' THEN
    RAISE EXCEPTION 'VALIDATION: Archived groups cannot be nested.';
  END IF;

  -- System groups are leaves for nesting: they may be included as children,
  -- but they must not themselves contain nested groups.
  IF parent_row.is_system_group THEN
    RAISE EXCEPTION
      'VALIDATION: System groups cannot contain nested groups.';
  END IF;

  IF public.notification_group_nesting_would_cycle(
    NEW.church_id,
    NEW.parent_group_id,
    NEW.child_group_id
  ) THEN
    RAISE EXCEPTION
      'VALIDATION: This group cannot be added because it would create a circular group relationship.';
  END IF;

  -- Resulting chain depth = depth from any ancestor down through parent + 1 + child subtree.
  -- Approximate: depth of parent as descendant of itself (0) + 1 + child subtree,
  -- plus how deep the parent already sits under other parents.
  WITH RECURSIVE ancestors AS (
    SELECT
      n.parent_group_id AS group_id,
      1 AS depth
    FROM public.notification_group_nestings n
    WHERE n.church_id = NEW.church_id
      AND n.child_group_id = NEW.parent_group_id
      AND n.status = 'active'
      AND n.id IS DISTINCT FROM NEW.id

    UNION ALL

    SELECT
      n.parent_group_id,
      a.depth + 1
    FROM ancestors a
    JOIN public.notification_group_nestings n
      ON n.church_id = NEW.church_id
     AND n.child_group_id = a.group_id
     AND n.status = 'active'
    WHERE a.depth < public.notification_group_max_nesting_depth() + 1
  )
  SELECT COALESCE(MAX(depth), 0) INTO parent_depth_from_roots
  FROM ancestors;

  child_subtree_depth := public.notification_group_nesting_subtree_depth(
    NEW.church_id,
    NEW.child_group_id
  );

  resulting_depth := parent_depth_from_roots + 1 + child_subtree_depth;

  IF resulting_depth > public.notification_group_max_nesting_depth() THEN
    RAISE EXCEPTION
      'VALIDATION: Nesting depth cannot exceed % levels.',
      public.notification_group_max_nesting_depth();
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.added_at := COALESCE(NEW.added_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_group_nestings_validate
  ON public.notification_group_nestings;
CREATE TRIGGER notification_group_nestings_validate
  BEFORE INSERT OR UPDATE OF
    church_id,
    parent_group_id,
    child_group_id,
    status
  ON public.notification_group_nestings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_notification_group_nesting();

-- Touch updated_at on soft-remove / updates (reuse existing helper from 029)
DROP TRIGGER IF EXISTS notification_group_nestings_touch_updated_at
  ON public.notification_group_nestings;
CREATE TRIGGER notification_group_nestings_touch_updated_at
  BEFORE UPDATE ON public.notification_group_nestings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notifications_updated_at();

-- ---------------------------------------------------------------------------
-- Recursive descendant group IDs (includes root)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_notification_group_descendant_ids(
  p_church_id uuid,
  p_root_group_id uuid,
  p_max_depth integer DEFAULT NULL
)
RETURNS TABLE (group_id uuid, depth integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT
      g.id AS group_id,
      0 AS depth
    FROM public.notification_groups g
    WHERE g.church_id = p_church_id
      AND g.id = p_root_group_id
      AND g.status = 'active'

    UNION ALL

    SELECT
      n.child_group_id,
      t.depth + 1
    FROM tree t
    JOIN public.notification_group_nestings n
      ON n.church_id = p_church_id
     AND n.parent_group_id = t.group_id
     AND n.status = 'active'
    JOIN public.notification_groups cg
      ON cg.id = n.child_group_id
     AND cg.church_id = p_church_id
     AND cg.status = 'active'
    WHERE t.depth < COALESCE(
      p_max_depth,
      public.notification_group_max_nesting_depth()
    )
  )
  SELECT DISTINCT ON (tree.group_id)
    tree.group_id,
    tree.depth
  FROM tree
  ORDER BY tree.group_id, tree.depth;
$$;

REVOKE ALL ON FUNCTION public.resolve_notification_group_descendant_ids(uuid, uuid, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_notification_group_descendant_ids(uuid, uuid, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Effective members for a group (direct + nested + system dynamic rules)
-- Deduped by user_id. source_group_id is the leaf group that contributed
-- the membership (not the full path — path assembly stays in app services).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_notification_group_effective_members(
  p_church_id uuid,
  p_root_group_id uuid,
  p_max_depth integer DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  membership_id uuid,
  role text,
  source_kind text,
  source_group_id uuid,
  source_group_name text,
  is_direct boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_church_member(p_church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: not an active member of this church';
  END IF;

  RETURN QUERY
  WITH descendants AS (
    SELECT d.group_id, d.depth
    FROM public.resolve_notification_group_descendant_ids(
      p_church_id,
      p_root_group_id,
      p_max_depth
    ) d
  ),
  group_meta AS (
    SELECT
      g.id,
      g.name,
      g.is_system_group,
      g.dynamic_rule_type,
      g.dynamic_rule_value
    FROM public.notification_groups g
    JOIN descendants d ON d.group_id = g.id
    WHERE g.church_id = p_church_id
      AND g.status = 'active'
  ),
  direct_members AS (
    SELECT
      m.user_id,
      m.membership_id,
      cm.role::text AS role,
      CASE
        WHEN gm.id = p_root_group_id THEN 'direct'
        ELSE 'inherited'
      END AS source_kind,
      gm.id AS source_group_id,
      gm.name AS source_group_name,
      (gm.id = p_root_group_id) AS is_direct
    FROM group_meta gm
    JOIN public.notification_group_members m
      ON m.group_id = gm.id
     AND m.church_id = p_church_id
     AND m.status = 'active'
    JOIN public.church_memberships cm
      ON cm.id = m.membership_id
     AND cm.church_id = p_church_id
     AND cm.status = 'active'
    WHERE gm.is_system_group = false
       OR gm.dynamic_rule_type IS NULL
  ),
  system_members AS (
    SELECT
      cm.user_id,
      cm.id AS membership_id,
      cm.role::text AS role,
      CASE
        WHEN gm.id = p_root_group_id THEN 'direct'
        ELSE 'inherited'
      END AS source_kind,
      gm.id AS source_group_id,
      gm.name AS source_group_name,
      (gm.id = p_root_group_id) AS is_direct
    FROM group_meta gm
    JOIN public.church_memberships cm
      ON cm.church_id = p_church_id
     AND cm.status = 'active'
    WHERE gm.is_system_group = true
      AND (
        (
          gm.dynamic_rule_type = 'role'
          AND gm.dynamic_rule_value IS NOT NULL
          AND cm.role::text = gm.dynamic_rule_value
        )
        OR (
          gm.dynamic_rule_type = 'membership_status'
          AND gm.dynamic_rule_value = 'active'
        )
      )
  ),
  combined AS (
    SELECT * FROM direct_members
    UNION ALL
    SELECT * FROM system_members
  ),
  ranked AS (
    SELECT
      c.*,
      ROW_NUMBER() OVER (
        PARTITION BY c.user_id
        ORDER BY
          CASE WHEN c.is_direct THEN 0 ELSE 1 END,
          c.source_group_name
      ) AS rn
    FROM combined c
  )
  SELECT
    r.user_id,
    r.membership_id,
    r.role,
    r.source_kind,
    r.source_group_id,
    r.source_group_name,
    r.is_direct
  FROM ranked r
  WHERE r.rn = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_notification_group_effective_members(uuid, uuid, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_notification_group_effective_members(uuid, uuid, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Non-destructive inventory helper (read-only report for admins)
-- Flags custom groups that look like they may have been bulk-filled by role
-- (high overlap with a system role group). Does not mutate data.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_notification_groups_possible_role_flattening(
  p_church_id uuid
)
RETURNS TABLE (
  group_id uuid,
  group_name text,
  matching_role text,
  direct_member_count bigint,
  role_holder_count bigint,
  overlapping_count bigint,
  overlap_ratio numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_notification_groups(p_church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: only group managers can run this report';
  END IF;

  RETURN QUERY
  WITH role_holders AS (
    SELECT
      cm.role::text AS role,
      cm.id AS membership_id
    FROM public.church_memberships cm
    WHERE cm.church_id = p_church_id
      AND cm.status = 'active'
  ),
  custom_directs AS (
    SELECT
      g.id AS group_id,
      g.name AS group_name,
      m.membership_id
    FROM public.notification_groups g
    JOIN public.notification_group_members m
      ON m.group_id = g.id
     AND m.church_id = p_church_id
     AND m.status = 'active'
    WHERE g.church_id = p_church_id
      AND g.is_system_group = false
      AND g.status <> 'archived'
  )
  SELECT
    cd.group_id,
    cd.group_name,
    rh.role AS matching_role,
    COUNT(DISTINCT cd.membership_id)::bigint AS direct_member_count,
    (
      SELECT COUNT(*)::bigint
      FROM role_holders rh2
      WHERE rh2.role = rh.role
    ) AS role_holder_count,
    COUNT(DISTINCT cd.membership_id) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM role_holders rh3
        WHERE rh3.role = rh.role
          AND rh3.membership_id = cd.membership_id
      )
    )::bigint AS overlapping_count,
    ROUND(
      (
        COUNT(DISTINCT cd.membership_id) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM role_holders rh3
            WHERE rh3.role = rh.role
              AND rh3.membership_id = cd.membership_id
          )
        )::numeric
        / NULLIF(
          (
            SELECT COUNT(*)::numeric
            FROM role_holders rh2
            WHERE rh2.role = rh.role
          ),
          0
        )
      ),
      3
    ) AS overlap_ratio
  FROM custom_directs cd
  CROSS JOIN (
    SELECT DISTINCT role FROM role_holders
  ) rh
  GROUP BY cd.group_id, cd.group_name, rh.role
  HAVING COUNT(DISTINCT cd.membership_id) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM role_holders rh3
      WHERE rh3.role = rh.role
        AND rh3.membership_id = cd.membership_id
    )
  ) >= 2
  ORDER BY overlap_ratio DESC NULLS LAST, cd.group_name, rh.role;
END;
$$;

REVOKE ALL ON FUNCTION public.report_notification_groups_possible_role_flattening(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_notification_groups_possible_role_flattening(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_group_nestings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notification group nestings viewable by church members"
  ON public.notification_group_nestings;
CREATE POLICY "Notification group nestings viewable by church members"
  ON public.notification_group_nestings
  FOR SELECT
  TO authenticated
  USING (public.is_active_church_member(church_id));

DROP POLICY IF EXISTS "Notification group nestings manageable by parent managers"
  ON public.notification_group_nestings;
CREATE POLICY "Notification group nestings manageable by parent managers"
  ON public.notification_group_nestings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notification_groups parent
      WHERE parent.id = notification_group_nestings.parent_group_id
        AND parent.church_id = notification_group_nestings.church_id
        AND parent.is_system_group = false
        AND public.can_manage_notification_group(
          parent.church_id,
          parent.group_type,
          parent.is_system_group
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notification_groups parent
      JOIN public.notification_groups child
        ON child.id = notification_group_nestings.child_group_id
       AND child.church_id = notification_group_nestings.church_id
      WHERE parent.id = notification_group_nestings.parent_group_id
        AND parent.church_id = notification_group_nestings.church_id
        AND parent.is_system_group = false
        AND child.status <> 'archived'
        AND public.can_manage_notification_group(
          parent.church_id,
          parent.group_type,
          parent.is_system_group
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.notification_group_nestings TO authenticated;
GRANT ALL ON public.notification_group_nestings TO service_role;

-- Prefer soft-remove (status = removed) over hard delete
REVOKE DELETE ON public.notification_group_nestings FROM authenticated;
