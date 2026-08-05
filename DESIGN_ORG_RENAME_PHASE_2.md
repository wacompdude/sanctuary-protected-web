# Phase 2 — Church → Organization Table Rename (Migration Plan)

Status: **SQL drafted — not applied**  
Scope: **Option A** (tables only; keep `church_id` columns)  
Strategy: **A — Coordinated maintenance deployment**

---

## Summary

Phase 2 delivers:

1. Forward migration: `supabase/migrations/071_rename_church_tables_to_organizations.sql`
2. Rollback migration: `supabase/migrations/rollback/071_rename_church_tables_to_organizations.sql`
3. Verification queries: `supabase/migrations/rollback/071_verify_organization_rename.sql`

The forward migration:

- Renames 13 physical tables with `ALTER TABLE … RENAME` (data/IDs/FKs preserved)
- Rewrites **all public function bodies** that hard-code old table names via `pg_get_functiondef` + ordered replacements (required because PostgreSQL does not rewrite plpgsql source on rename)
- Keeps function names, enum names, `church_id` columns, Storage paths, and UI terminology unchanged

**Do not apply 071 until application `.from("church*")` callers are updated and a maintenance window is scheduled (Phases 3–5 / 7).**

---

## Affected Table Inventory

| Old | New |
|---|---|
| `churches` | `organizations` |
| `church_memberships` | `organization_memberships` |
| `church_membership_roles` | `organization_membership_roles` |
| `church_invitations` | `organization_invitations` |
| `church_contacts` | `organization_contacts` |
| `church_threat_levels` | `organization_threat_levels` |
| `church_notification_settings` | `organization_notification_settings` |
| `church_schedule_settings` | `organization_schedule_settings` |
| `church_policy_settings` | `organization_policy_settings` |
| `church_subscriptions` | `organization_subscriptions` |
| `church_entitlement_overrides` | `organization_entitlement_overrides` |
| `church_role_settings` | `organization_role_settings` |
| `training_church_settings` | `training_organization_settings` |

---

## Column Inventory

| Kept unchanged (Option A) |
|---|
| `church_id` on all tenant tables |
| `church_membership_id` |
| Enums: `church_status`, `church_subscription_status`, `church_contact_type`, `church_membership_role_status` |
| Function names: `is_active_church_member`, `create_church_with_owner`, etc. |
| Storage paths: `churches/{church_id}/…` |

Transitional shape after 071:

```text
organizations.id
organization_memberships.church_id  →  organizations.id
```

---

## Dependency Map

| Object | Behavior after rename |
|---|---|
| Foreign keys | Follow relation OID — remain valid |
| RLS policies on renamed tables | Move with table |
| RLS expressions using relation OIDs | Continue to resolve |
| plpgsql / SQL function **source text** | **Must rewrite** (done in 071) |
| Views (if any with stored text) | OID-based usually OK; none critical found |
| Realtime publications | None configured in-repo |
| Storage policies | Keep paths; auth helpers updated via function rewrite |
| App `.from("church*")` | **Breaks until Phase 3–5 deploy** |

---

## Migration Strategy

### Rename order

Single transaction. Function rewrite runs **after** all renames.

### Transaction

Entire forward migration is wrapped in `BEGIN` … `COMMIT` with preflight + post-checks that `RAISE EXCEPTION` on failure (forces rollback).

### Compatibility

No compatibility views (Strategy B rejected for writable RLS/trigger risk).  
**Deploy app + 071 in one maintenance window.**

### Maintenance (dev / prod)

1. Announce window  
2. Pause demo restore / prefer pause notification crons  
3. Record pre-migration counts (verification file §2)  
4. Enable app maintenance if available  
5. Apply `071_rename_church_tables_to_organizations.sql`  
6. Deploy application with new table strings  
7. Run verification queries  
8. Smoke test  
9. Resume jobs  

### Rollback

1. Redeploy previous application build (old table names)  
2. Apply `rollback/071_rename_church_tables_to_organizations.sql`  
3. Re-verify `churches` exists and helpers work  

---

## Customer-Facing Terminology

Unchanged: Church UI, `/settings/church`, `/platform/churches`, emails, help, Storage path prefix `churches/`.

---

## Files Created This Phase

- `supabase/migrations/071_rename_church_tables_to_organizations.sql`
- `supabase/migrations/rollback/071_rename_church_tables_to_organizations.sql`
- `supabase/migrations/rollback/071_verify_organization_rename.sql`
- `DESIGN_ORG_RENAME_PHASE_2.md`

### Later phases

- Phase 3 (done on branch): app `.from()` / demo-seed / ops SQL table strings → `organization*`
- Phase 4+: apply `071` in maintenance window **with** app deploy (do not apply alone)

---

## Database Changes

Exact SQL is in the migration files above. **Not applied** in Phase 2.

---

## Rollback Plan

Exact reverse migration: `supabase/migrations/rollback/071_rename_church_tables_to_organizations.sql`  
Must be paired with application rollback.

---

## Application Changes

Deferred to Phase 3:

- Replace `.from("churches")` → `.from("organizations")` (and all 12 others)
- Keep `getActiveChurch` / `church_id` in TS
- Optional `TABLES` constants registry
- Update demo-seed registry strings
- Do not change UI copy

---

## Validation

Phase 2 does not run lint/build against a renamed schema (no apply).

Before Phase 4 apply in development:

1. Snapshot counts against current names  
2. Apply 071 in Supabase SQL Editor  
3. Deploy app with new `.from()` strings  
4. Run `rollback/071_verify_organization_rename.sql`  
5. `npm run lint` / `npm run build`

---

## Testing Instructions

### Pre-apply (now)

1. Confirm backup / PITR.  
2. `select tablename from pg_tables where schemaname='public' and tablename like '%church%';`  
3. Save row counts for the 13 source tables.

### Post-apply (Phase 4+)

1. Run verification SQL — expect zero leftover function refs.  
2. Login, switch church, Team, Incidents, Settings → Church, Platform → Churches.  
3. Create a test church (`create_church_with_owner`).  
4. Confirm Storage uploads still authorize (paths unchanged).

---

## Remaining Work

- Phase 3: App `.from()` updates + lint/build  
- Phase 4: Apply 071 in **development** only after Phase 3 ready  
- Phase 5–6: Finish refs, smoke tests  
- Phase 7: Production maintenance plan (explicit approval)  
- Later: Option B `church_id` → `organization_id`  
- Later: rename SQL functions / enums  
- Update `ops_delete_user_by_email.sql` when applying  

---

## Risks

1. Applying 071 **without** app deploy breaks all `.from("churches")` calls.  
2. Function rewrite uses word-boundary regex to avoid mangling `church_id` / enum names.  
3. Historical migrations `001–070` remain as history (not rewritten).  
4. `rollback/` is **not** auto-applied — run manually only.  
