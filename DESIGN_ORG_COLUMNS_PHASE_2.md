# Phase 2 — Church → Organization Column Rename (Migration Plan)

Status: **SQL drafted — not applied**  
Scope: **Option B** (columns only; tables already renamed in `071`)  
Strategy: **A — Coordinated maintenance deployment**

---

## Summary

Phase 2 delivers:

1. Forward migration: `supabase/migrations/072_rename_church_columns_to_organization.sql`
2. Rollback migration: `supabase/migrations/rollback/072_rename_church_columns_to_organization.sql`
3. Verification queries: `supabase/migrations/rollback/072_verify_organization_columns.sql`

The forward migration:

- Dynamically discovers every `public` table with `church_id` / `church_membership_id`
- Runs `ALTER TABLE … RENAME COLUMN` (data, PKs, FKs, indexes, RLS attnums preserved)
- Rewrites **public function bodies** via `pg_get_functiondef` (required because PostgreSQL does not rewrite plpgsql source on column rename)
- **Keeps input parameter names** (`p_church_id`, `requested_church_id`) — PostgreSQL `CREATE OR REPLACE` cannot rename input parameters (error `42P13`)
- Keeps SQL **function names**, **enums**, Storage path prefix `churches/`, and UI “Church” terminology unchanged

**Do not apply 072 until application `.eq("church_id")` / insert / RPC callers are updated and a maintenance window is scheduled (Phases 3–5 / 7).**

---

## Affected Column Inventory

| Old column | New column | Approx. tables |
|---|---|---:|
| `church_id` | `organization_id` | ~94+ (dynamic) |
| `church_membership_id` | `organization_membership_id` | 2 (`campus_memberships`, `organization_membership_roles`) |

Not columns (unchanged in 072):

- Enums: `church_status`, `church_subscription_status`, `church_contact_type`, `church_membership_role_status`
- Function names: `is_active_church_member`, `create_church_with_owner`, `church_id_from_*_path`, …
- Storage paths: `churches/{id}/…`
- Tables already renamed in 071

Inventory snapshot of tables expected to have `church_id` (post-071 names) is in the Phase 1 review; live apply uses `information_schema` so newly added tables are included automatically.

---

## Dependency Map

| Object | Behavior after column rename |
|---|---|
| Foreign keys | Follow column OID — remain valid |
| Unique / check / PK | Follow column OID — remain valid |
| Indexes | Follow column OID — remain valid (names may still say `church_id`) |
| RLS policy trees | Attribute-number based — continue to resolve; `pg_policies` text shows new name |
| plpgsql / SQL function **source text** | **Must rewrite** (done in 072) |
| Views / matviews | None critical found |
| Realtime | No app filters on `church_id` found |
| Storage policies | Keep paths; helpers `church_id_from_*` **names** kept; bodies updated |
| App `.eq("church_id")` / inserts / `p_church_id` | **Breaks until Phase 3–5 deploy** |

---

## Customer-Facing Terminology

Unchanged: Church UI, `/settings/church`, `/platform/churches`, emails, Help Center, Storage path prefix `churches/`.

---

## Migration Strategy

### Rename order (single transaction)

1. Preflight (071 tables exist; source columns exist; targets absent)
2. `church_membership_id` → `organization_membership_id`
3. `church_id` → `organization_id` (all matching tables)
4. Function body rewrite:
   - Protect `church_id_from_` name prefix
   - `church_membership_id` → `organization_membership_id`
   - `church_id` → `organization_id` (also rewrites `p_church_id`, `requested_church_id`, `v_*church_id*`, JSON keys)
   - Restore `church_id_from_`
5. Post-checks (no leftover columns; key tables have `organization_id`; no stale function refs)

### Compatibility

No duplicate columns / dual-write.  
**Deploy app + 072 in one maintenance window.**

### RPC / parameter impact

Function **names** stay church-focused.  
Input **parameter names** stay `p_church_id` / `requested_church_id` (required for `CREATE OR REPLACE` compatibility).  
Bodies compare those params to the renamed `organization_id` column.  
PostgREST callers can keep passing `p_church_id` — only table column strings in the app must change.

### Maintenance window

1. Announce window  
2. Confirm backup / PITR  
3. Pause notification crons + demo restore  
4. Record pre-migration column counts + row counts (verify file §5)  
5. Enable app maintenance if available  
6. Apply `072_rename_church_columns_to_organization.sql`  
7. Deploy application with `organization_id` query strings + RPC args  
8. Run `072_verify_organization_columns.sql`  
9. Smoke test  
10. Resume jobs  

### Rollback

1. Redeploy previous application build (`church_id` / `p_church_id`)  
2. Apply `rollback/072_rename_church_columns_to_organization.sql`  
3. Re-verify `church_id` exists and helpers work  

---

## Files Created This Phase

- `supabase/migrations/072_rename_church_columns_to_organization.sql`
- `supabase/migrations/rollback/072_rename_church_columns_to_organization.sql`
- `supabase/migrations/rollback/072_verify_organization_columns.sql`
- `DESIGN_ORG_COLUMNS_PHASE_2.md`

### Later phases

- Phase 3 (done on branch): app `"church_id"` / insert keys → `organization_id`; RPC args stay `p_church_id`
- Phase 4+: deploy app against applied `072`; smoke test
- Optional later: cosmetic index/constraint renames; enum / function-name renames; TS `churchId` → `organizationId`

---

## Database Changes

Exact SQL is in the migration files above. **Not applied** in Phase 2.

Cosmetic index/constraint renames (e.g. `*_church_id_idx` → `*_organization_id_idx`) are **deferred** for lower risk (same choice as 071).

---

## Rollback Plan

Exact reverse migration: `supabase/migrations/rollback/072_rename_church_columns_to_organization.sql`  
Must be paired with application rollback.

---

## Application Changes

Deferred to Phase 3:

- `.eq("church_id")` → `.eq("organization_id")`
- Insert/update objects `church_id:` → `organization_id:`
- `church_membership_id` → `organization_membership_id`
- RPC args stay `p_church_id` / `requested_church_id` (unchanged by 072)
- Select lists / CSV / reports
- Demo-seed inserts and RPCs
- Prefer keeping TS `churchId` temporarily at service boundary
- Do not change UI copy

---

## RLS and Security Review

- Column rename preserves RLS attachment and attnum-based quals.
- Function bodies that implement membership / role / manage checks are rewritten to `organization_id`.
- No permissive `USING (true)` temporary policies.
- Post-apply: verify Church A cannot read Church B; campus limits; platform support sessions; Storage uploads still authorize via `church_id_from_*` + membership helpers.

---

## Validation

Phase 2 does not run lint/build against a renamed schema (no apply).

Before Phase 4 apply in development:

1. Snapshot counts against current column names  
2. Apply 072 in Supabase SQL Editor  
3. Deploy app with new column strings  
4. Run `rollback/072_verify_organization_columns.sql`  
5. `npm run lint` / `npm run test` / `npm run build`

---

## Testing Instructions

### Pre-apply (now)

1. Confirm backup / PITR.  
2. Record:

```sql
SELECT column_name, count(*) 
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('church_id', 'church_membership_id')
GROUP BY 1;
```

3. Save row counts for key tables (verify file §5).

### Post-apply (Phase 4+)

1. Verification SQL — expect zero leftover `church_id` columns; helpers renamed args.  
2. Login, switch church, Team, Incidents, Settings → Church, Platform → Churches.  
3. Create church (`create_church_with_owner`).  
4. Storage upload (branding / incident media).  
5. Demo seed upsert/cleanup.  
6. Confirm UI still says Church.

---

## Remaining Work

- Phase 3: App column/RPC string updates + lint/build  
- Phase 4: Apply 072 in **development** only after Phase 3 ready  
- Phase 5–6: Finish refs, smoke tests  
- Phase 7: Production maintenance plan (explicit approval)  
- Later: enum/function renames; TS `churchId` → `organizationId`; index name cosmetics  

---

## Risks

1. Applying 072 **without** app deploy breaks nearly all tenant queries and named RPC args.  
2. Function rewrite keeps RPC parameter names; only column references / locals change.  
3. `church_id_from_*` **names** intentionally preserved; bodies updated.  
4. Historical migrations `001–071` remain as history (not rewritten).  
5. `rollback/` is **not** auto-applied — run manually only.  
6. Larger blast radius than 071 (~94 tables + function params).  
