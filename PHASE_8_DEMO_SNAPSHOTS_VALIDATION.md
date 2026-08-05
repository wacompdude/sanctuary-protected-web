# Demo Organization Snapshot & Restore — Phase 8 Final Validation

Status: **Feature complete for Phases 1–7.** Runtime restore/rollback against live First Church still requires applying migrations and operator smoke tests in your environment.

Related design: `DESIGN_DEMO_ORGANIZATION_SNAPSHOTS.md`

Commits (Phases 3–7):

- `240bbf0` Guardrails + console shell
- `a30b8de` Snapshot creation
- `d58cb62` Dry-run restore + auto-rollback
- `53bc576` Recovery / emergency unlock / lock expiry
- `dbf4d6e` Version management / filters / retention

---

## Summary

The Platform Administration console can mark a hard-demo organization, create versioned snapshots (DB + Storage), dry-run and restore with MFA/reauth/typed confirmation, automatically create safety snapshots and roll back on failure, recover stuck locks, and manage snapshot metadata/retention. Customer UI remains “Church”; internal identifiers are `organization_*`.

---

## Demo organization configured

| Item | Expected state |
|------|----------------|
| Identity | `is_demo_organization = true` (never name alone) |
| Seed helper | `seed_source = first-church-demo` used only to locate org for “Mark as demo” |
| Flags | `demo_restore_enabled`, `demo_restore_locked`, `demo_maintenance_mode`, `demo_environment_label` |
| Console | `/platform/demo-organizations` |

**Operator step:** Apply `080` then `081`, open Demo Environments, mark First Church demo if not already flagged.

---

## Snapshot versions

Supported named versions (examples): Clean Starting Demo, Servant / Steward / Shepherd / Omni demos, training/sales variants.

Each ready snapshot stores:

- `name`, `slug`, `version_label`, `tags`
- `subscription_plan_key_snapshot` + entitlement overrides JSON
- `record_counts`, `file_count`, checksums
- `is_default`, `is_protected`, `is_automatic`
- Storage: `manifest.json` + `data.json` + copied files under private bucket `demo-organization-snapshots`

---

## Included / preserved / merged / excluded tables

Registry size: **100** entries. Payload export: **92** (replace + merge).

### Replace (89)

organization_notification_settings, organization_schedule_settings, organization_policy_settings, training_organization_settings, organization_role_settings, dashboard_box_settings, organization_contacts, organization_threat_levels, campuses, campus_locations, organization_membership_roles, campus_memberships, organization_invitations, team_members, security_groups, security_group_members, security_group_permissions, user_permissions, security_audit_logs, organization_entitlement_overrides, subscription_change_history, subscription_usage, subscription_usage_events, notification_groups, notification_group_members, notification_group_defaults, notification_group_nestings, notification_endpoints, notification_targets, notification_preferences, notification_preference_rules, notification_templates, notifications, notification_recipients, incidents, incident_updates, incident_attachments, incident_team_members, events, schedule_templates, schedule_events, schedule_shifts, shift_assignments, member_unavailability, schedule_change_history, security_equipment, radio_details, camera_details, video_recorder_details, network_device_details, access_control_details, alarm_device_details, sensor_details, power_backup_details, first_response_details, equipment_relationships, equipment_assignments, equipment_maintenance, equipment_attachments, medical_supplies, medical_supply_usage, policy_categories, policy_tags, policy_documents, policy_versions, policy_document_tags, policy_attachments, policy_approvals, policy_assignments, policy_acknowledgments, policy_review_history, training_categories, training_category_church_state, training_courses, training_course_church_state, training_events, training_event_assignments, training_participants, training_requirements, training_completion_records, training_external_records, training_documents, certifications, safety_concern_profiles, safety_concern_profile_campuses, safety_concern_photos, safety_concern_reviews, safety_concern_incidents, audit_logs

### Merge (3)

organizations, organization_memberships, organization_subscriptions

### Preserve (2) — not in snapshot payload

demo_seed_records, profiles

### Exclude (6)

notification_deliveries, schedule_reminder_keys, billing_customers, billing_events, notification_provider_events, platform_access_sessions

Authoritative source: `lib/platform/demo-snapshots/snapshot-table-registry.ts`

---

## Protected accounts

- Table: `demo_protected_accounts` (org + Auth `user_id`, expected role)
- Snapshots record `protected_account_ids` in the manifest
- Restore never deletes Auth users or stores passwords/MFA
- Memberships are cleared/reinserted from snapshot; Auth users remain
- Verification requires ≥1 active owner and listed protected accounts active when present
- Fallback when table empty: active owner/co_owner memberships

---

## Database changes

| Migration | Purpose |
|-----------|---------|
| `080_demo_environments_permission_category.sql` | `platform_permission_category` += `demo_environments` |
| `081_demo_organization_snapshots.sql` | Demo columns on `organizations`; `demo_protected_accounts`; `demo_organization_snapshots`; `demo_organization_restore_operations`; `demo_organization_restore_locks`; `is_demo_restore_eligible()`; permission seeds + role grants |

RLS: snapshot/restore/lock/protected-account tables enabled with **no** authenticated/anon policies — service role after Next.js platform permission checks only.

---

## Storage changes

- Private bucket: `demo-organization-snapshots` (auto-create attempted on first snapshot)
- Layout: `organizations/{organizationId}/snapshots/{snapshotId}/manifest.json|data.json|files/{bucket}/…`
- Copy via Storage download/upload API (not SQL metadata renames)
- Incomplete prefixes cleaned best-effort on create failure
- Source buckets referenced: church-branding, incident-media, equipment-media, policy-media, training-media, safety-concern-photos

---

## Platform permissions

| Permission | Typical roles (seeded in 081) |
|------------|-------------------------------|
| demo_organizations.read | super_admin, platform_admin, developer, support, auditor |
| demo_organizations.manage | super_admin, platform_admin |
| demo_snapshots.read | same as read |
| demo_snapshots.create | super_admin, platform_admin, developer |
| demo_snapshots.restore | super_admin, platform_admin (+ explicit for developer) |
| demo_snapshots.archive / set_default | super_admin, platform_admin |
| demo_snapshots.delete / protect | super_admin |
| demo_restores.rollback | super_admin, platform_admin |
| demo_restores.unlock | super_admin |

High-risk actions also require MFA + ≤15 minute session (`requireRecentPlatformAuthentication`) and typed phrases:

- Restore / manual rollback: `RESTORE FIRST CHURCH DEMO`
- Emergency unlock: `EMERGENCY UNLOCK DEMO CHURCH`

---

## Files created / modified (feature set)

### Created (high level)

- `DESIGN_DEMO_ORGANIZATION_SNAPSHOTS.md`
- `supabase/migrations/080_*.sql`, `081_*.sql` (+ draft under `migrations/draft/`)
- `lib/platform/demo-snapshots/*` (registry, create, restore, dry-run, verify, recovery, retention, versioning, alerts, locks, …)
- `app/platform/(console)/demo-organizations/**`
- `components/platform/demo-*-forms.tsx`, `demo-recovery-panel.tsx`, `demo-restore-form.tsx`, `demo-org-forms.tsx`

### Modified

- `lib/platform/permission-keys.ts`, `lib/platform/navigation.ts`
- `lib/audit/actions.ts`
- `lib/notifications/create-notification.ts`, `dispatch-notification.ts` (suppress during restore/maintenance)
- `package.json` (`selfcheck:demo-snapshots`)

---

## Validation run (this phase)

| Check | Result |
|-------|--------|
| `npm run selfcheck:demo-snapshots` | Passed |
| `npm run lint` | Fails on **pre-existing** `lib/security/*` unused/any issues — not introduced by demo-snapshots |
| `npm run build` | Compiled; TypeScript failed until duplicate Phase 7 forms were removed from `demo-snapshot-forms.tsx` (fixed); re-run build as part of operator checklist |
| `npm test` | No project `test` script; use `selfcheck:*` scripts |

---

## Restore / rollback / tier tests (operator checklist)

1. Apply `080` → `081` in Supabase SQL editor.
2. Ensure private bucket `demo-organization-snapshots` exists (or allow auto-create).
3. Seed First Church if needed; mark demo via console.
4. Create snapshot “Clean Starting Demo” → status `ready`, checksums present.
5. Change demo data (incident/campus) → create second snapshot with different plan if testing tiers.
6. Dry-run restore of snapshot A → confirm deltas, no writes.
7. Restore with MFA + phrase → safety snapshot created → verification passes → maintenance cleared.
8. Force a failure path (optional) or use recovery UI: emergency unlock, manual rollback from safety snapshot.
9. Apply retention (14 days default) against old automatic snapshots.
10. Confirm church app notifications do not send while `demo_maintenance_mode` is on.

Tier-specific: restore Servant / Steward / Shepherd / Omni snapshots and confirm `subscription_plan_key_snapshot` + scrubbed `billing_provider = internal_demo` with no Stripe calls.

---

## Remaining risks

1. Serverless timeout on large demos (mitigated by small First Church dataset + `maxDuration = 300` on restore routes).
2. Registry drift when new org-scoped tables are added.
3. Missing Storage objects become warnings, not hard failures — restore may leave gaps if files were deleted outside the app.
4. `training-media` bucket may not exist in all environments.
5. Full project `npm run lint` still red due to unrelated security module debt.
6. Church write paths are not all wired to `assertNotInDemoMaintenance` yet — notification create/dispatch are; broader mutation coverage is deferred.
7. Live operator restore against production demo org not executed in this agent session.

---

## Recommended operating procedure

1. Keep First Church `is_demo_organization = true` and `demo_restore_enabled = true` in non-customer environments only.
2. After meaningful demo content changes, create a named ready snapshot; mark one as default reset.
3. Protect golden sales/training baselines.
4. Before restore: dry-run → confirm phrase → ensure MFA/fresh login.
5. If restore fails and auto-rollback fails: use restore-history recovery (manual rollback or emergency unlock), then investigate.
6. Weekly: apply retention for automatic safety snapshots; review platform alerts on restore-history.
7. Never restore by church name; never enable flags on real customer orgs.

---

## Remaining / postponed work

- Automated nightly reset job
- Cross-environment snapshot promotion
- Snapshot encryption-key rotation
- Point-in-time database recovery product
- General customer backup product (this system is demo-only)
- Broader `assertNotInDemoMaintenance` on all church write actions
- Background job queue if First Church data grows past serverless limits

---

## Testing instructions (dev)

```powershell
npm run selfcheck:demo-snapshots
# Apply 080 then 081 in Supabase SQL editor
# Create bucket demo-organization-snapshots if needed
# Start app, sign in as platform admin with MFA
# Visit /platform/demo-organizations
```
