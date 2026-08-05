# Demo Organization Snapshot & Restore — Phase 2 Architecture

Status: **Phases 1–8 complete.** See `PHASE_8_DEMO_SNAPSHOTS_VALIDATION.md` for the final validation report.  
UI terminology remains **Church / Demo Church**. Internal code uses **organization**.

Related artifacts:

- Registry: `lib/platform/demo-snapshots/snapshot-table-registry.ts`
- Migrations: `080_demo_environments_permission_category.sql`, `081_demo_organization_snapshots.sql`
- Guardrails: `lib/platform/demo-snapshots/guardrails.ts`, `locks.ts`
- Snapshot create: `lib/platform/demo-snapshots/create-snapshot.ts`, `export.ts`, `queries.ts`
- Restore: `lib/platform/demo-snapshots/restore.ts`, `dry-run.ts`, `verify.ts`
- Recovery: `lib/platform/demo-snapshots/recovery.ts`, `lock-expiry.ts`, `alerts.ts`
- Console: `/platform/demo-organizations` (+ `/snapshots`, `/restore`, `/restore-history`)

---

## Goals

Named, versioned snapshots of the First Church demo organization with safe restore, automatic pre-restore safety snapshots, demo-only hard guardrails, and no billing/notification side effects.

---

## Snapshot table registry

Single source of truth: `SNAPSHOT_TABLE_REGISTRY`.

| Strategy | Use |
|----------|-----|
| `replace` | Most tenant data — delete org rows, insert snapshot rows |
| `merge` | `organizations`, `organization_memberships`, `organization_subscriptions` — preserve identity / Auth / scrubbed demo billing |
| `preserve` | `profiles`, `demo_seed_records` — not driven by snapshot payload |
| `exclude` | Billing provider tables, delivery queues, platform sessions, reminder dedupe keys |

**Insert order:** ascending `dependencyOrder`  
**Delete order:** reverse of insert order  

See registry for full list (~90 entries including explicit excludes).

---

## Manifest format (`manifest.json`)

```json
{
  "snapshot_id": "uuid",
  "organization_id": "uuid",
  "organization_name_snapshot": "First Church of the First Church",
  "created_at": "ISO-8601",
  "created_by_platform_account_id": "uuid",
  "snapshot_format_version": 1,
  "database_schema_version": "080",
  "subscription_plan_key": "omni_enterprise",
  "feature_entitlements": {},
  "included_tables": ["…"],
  "excluded_tables": ["…"],
  "record_counts": { "incidents": 12 },
  "file_count": 2,
  "total_file_size_bytes": 12345,
  "checksums": {
    "manifest": "sha256:…",
    "data": "sha256:…",
    "files": { "relative/path": "sha256:…" }
  },
  "protected_account_ids": ["user-uuid"],
  "warnings": []
}
```

`data.json` holds table → row arrays (UUIDs preserved within the org graph).  
Files live under `files/{bucket}/{original_object_path}` with path map in manifest.

---

## Storage design

Private bucket: `demo-organization-snapshots`

```text
organizations/{organization_id}/snapshots/{snapshot_id}/manifest.json
organizations/{organization_id}/snapshots/{snapshot_id}/data.json
organizations/{organization_id}/snapshots/{snapshot_id}/files/{bucket}/…
```

- No public URLs; service-role / signed URLs for platform workers only  
- Copy via Storage API (same lesson as 078 — never SQL-rename blobs)  
- Incomplete snapshot prefixes deleted on failure  

---

## SQL (Phase 3 — apply order)

1. `080_demo_environments_permission_category.sql` — `ALTER TYPE … ADD VALUE 'demo_environments'` (own migration; enum add before use)  
2. `081_demo_organization_snapshots.sql` — demo columns, snapshot/restore/lock/protected-account tables, eligibility helper, permission seeds + role grants  

Historical combined draft (do not apply): `supabase/migrations/draft/080_demo_organization_snapshots.sql`

---

## RLS design

- Snapshot / restore / lock / protected-account tables: **RLS on, zero policies for `authenticated` / `anon`**  
- Only `service_role` after platform permission checks in Next.js server actions  
- Church-user RLS unchanged  
- Maintenance mode enforced in app write guards when `demo_maintenance_mode = true`  

---

## Platform permission matrix

| Permission | Super Admin | Platform Admin | Developer | Support | Auditor |
|------------|:-----------:|:--------------:|:---------:|:-------:|:-------:|
| demo_organizations.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| demo_organizations.manage | ✓ | ✓ | | | |
| demo_snapshots.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| demo_snapshots.create | ✓ | ✓ | ✓ | | |
| demo_snapshots.restore | ✓ | ✓ | *explicit* | | |
| demo_snapshots.archive | ✓ | ✓ | | | |
| demo_snapshots.delete | ✓ | | | | |
| demo_snapshots.protect | ✓ | | | | |
| demo_snapshots.set_default | ✓ | ✓ | | | |
| demo_restores.rollback | ✓ | ✓ | | | |
| demo_restores.unlock | ✓ | | | | |

\* Production restore for developers requires explicit grant (not default).

Every restore also requires: MFA + recent auth (15m) + reason + typed `RESTORE FIRST CHURCH DEMO`.

---

## Protected-account strategy

Table `demo_protected_accounts` lists Auth `user_id`s that must survive restore.

- Never delete/recreate Auth users  
- Never store passwords/MFA  
- Membership rows **merged** by `user_id`  
- Post-restore validation: required accounts active + expected role + ≥1 owner  

Seed from `DEMO_NAMED_USERS` + platform owner membership after First Church is flagged demo.

---

## Tier / entitlement strategy

1. Snapshot stores `subscription_plan_key_snapshot` + entitlement overrides  
2. Restore validates plan still exists in catalog  
3. Write `organization_subscriptions` with `billing_provider = 'internal_demo'`  
4. Clear/null real provider customer IDs  
5. **Refuse** if current sub has live paid provider IDs without scrub path  
6. No Stripe/billing API calls; no invoices  
7. Recalculate entitlements in-app  

---

## Transaction strategy

**Phase 5 initial approach (no job queue):**

1. Operation row `pending`  
2. Safety snapshot (Storage + metadata) — must succeed  
3. Lock + `demo_maintenance_mode = true`  
4. Stage files into snapshot staging prefix  
5. DB work in a single SECURITY DEFINER RPC where feasible (delete replace tables + insert), else ordered service-role batches with operation status checkpoints  
6. Finalize file paths / remove post-snapshot replace-mode files  
7. Verify  
8. Clear maintenance + release lock  

If DB succeeds and file finalize fails → automatic rollback from safety snapshot.

**Vercel limit mitigation:** start with First Church’s current small dataset; add `maxDuration` on restore route; later move to background worker if needed.

---

## Rollback design

- Every restore creates `is_automatic` safety snapshot (`pre_restore_snapshot_id`)  
- Failure → `rolling_back` → restore safety snapshot → verify → unlock  
- Manual rollback from restore history with same confirmations  
- Retention default 14 days (`DEMO_SAFETY_SNAPSHOT_RETENTION_DAYS_DEFAULT`)  

---

## Compatibility strategy

- Manifest fields: `snapshot_format_version`, `database_schema_version`  
- States: `compatible` | `transform_required` | `unsupported` | `invalid`  
- New exports use `organization_id` only  
- If a future snapshot ever contains `church_id`, transform in memory via `transformLegacyChurchSnapshotToOrganizationSnapshot()` — originals stay immutable  

---

## Notification suppression

Pass `operation_context: "demo_restore"` through mutations.  
Dispatch/scan paths must no-op when context set or when org `demo_maintenance_mode`.  
Do not insert pending `notification_deliveries` during restore.

---

## Proposed routes (Phase 3+)

```text
/platform/demo-organizations
/platform/demo-organizations/[organizationId]
/platform/demo-organizations/[organizationId]/snapshots
/platform/demo-organizations/[organizationId]/snapshots/new
/platform/demo-organizations/[organizationId]/snapshots/[snapshotId]
/platform/demo-organizations/[organizationId]/restore
/platform/demo-organizations/[organizationId]/restore-history
```

Nav label: **Demo Environments** (platform console only).

---

## Phase 3 checklist

| Item | Status |
|------|--------|
| Split/promote SQL → `080` + `081` | Done |
| Permission keys + Demo Environments nav | Done |
| Guardrails + restore locks + maintenance assert | Done |
| Console list/detail + mark-demo / flag / lock actions | Done |
| `npm run selfcheck:demo-snapshots` | Passed |
| Apply `080` then `081` in Supabase | **Your step** |
| Create private bucket `demo-organization-snapshots` | Auto-create on first snapshot; create in dashboard if API blocked |
| Mark First Church demo via UI | After migrations |
| Wire `assertNotInDemoMaintenance` on church write paths | Deferred to restore phase |

## Phase 4 checklist

| Item | Status |
|------|--------|
| Manifest + data.json export from registry | Done |
| Storage file copy + checksums | Done |
| Snapshot list / new / detail UI | Done |
| Default + protect + archive controls | Done |
| Self-check | Done |

## Phase 5 checklist

| Item | Status |
|------|--------|
| Dry-run preview (counts, plan, files) | Done |
| Typed confirmation + MFA + 15m reauth | Done |
| Automatic safety snapshot | Done |
| Lock + maintenance mode | Done |
| DB restore (replace + merge + scrub billing) | Done |
| File restore from snapshot Storage | Done |
| Verification gate | Done |
| Auto-rollback on failure | Done |
| Notification suppression (create + dispatch) | Done |
| Restore + history UI | Done |

## Phase 6 checklist

| Item | Status |
|------|--------|
| Automatic rollback alerts | Done |
| Manual rollback from safety snapshot | Done |
| Emergency unlock (`demo_restores.unlock`) | Done |
| Lock TTL auto-expiry on read + manual expire | Done |
| Failed-operation recovery | Done |
| Platform alerts via `platform_admin_actions` | Done |
| Recovery UI on restore-history | Done |

## Phase 7 checklist

| Item | Status |
|------|--------|
| Version labels + tier badges on list/detail | Done |
| Tags + feature summaries | Done |
| Snapshot search / filter UI | Done |
| Metadata edit (immutable contents) | Done |
| Default reset version controls | Done (existing + surfaced) |
| Safety snapshot retention rules | Done |
| Delete with baseline/protected/history safeguards | Done |

## Phase 8 checklist

| Item | Status |
|------|--------|
| Final validation report | Done — `PHASE_8_DEMO_SNAPSHOTS_VALIDATION.md` |
| Self-check | Passed |
| Operator smoke tests (live First Church restore) | **Your environment** |
| Full-repo lint clean | Blocked by unrelated `lib/security/*` debt |

---

---

## Risks

1. `ALTER TYPE … ADD VALUE` must run outside/before some transaction patterns (hence separate `080`)  
2. Full restore duration vs serverless timeout  
3. Registry must stay complete as new org tables are added  
4. Accidental apply of draft SQL — kept under `migrations/draft/`  
