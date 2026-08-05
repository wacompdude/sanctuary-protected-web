# Phase 2 — Expanded Roles & Permission Architecture (Locked Design)

Status: **accepted for implementation**  
Date: 2026-08-03

## Locked decisions

### 1. Campus ladder stays on `campus_memberships`

| Concern | Authority |
|---|---|
| Church-wide responsibility | `church_memberships.role` + `church_membership_roles` |
| Campus Administrator / Campus Security Leader ops | `campus_memberships.campus_role` |
| Permission defaults for campus roles | `role_permission_templates` (`role_kind = 'campus'`) + TS `CAMPUS_ROLE_PERMISSION_MAPPING` |

Do **not** add `campus_administrator` / `campus_security_leader` as church `membership_role` values.

### 2. Primary + secondary church roles

- Junction: `church_membership_roles`
- Exactly one active `is_primary = true` per membership
- `church_memberships.role` remains the synced primary (backward-compatible RLS / existing app code)
- Permission engine unions all active secondary + primary roles (dedupe grants)
- Explicit user DENY continues to override grants

### 3. Phase 2 deliverables

- Design (this doc)
- SQL migrations (`068`, `069`)
- TS types, ranks, labels, permission templates
- Minimal `canUserPerform` multi-role merge
- **Out of scope:** Roles UI, member editor UX, page-by-page `requirePermission` cutover, RLS rewrite of product tables

---

## Church roles

### Retained

`owner` · `co_owner` · `administrator` · `security_leader` · `security_member` · `viewer`

### Added (church `membership_role`)

| Role key | Purpose |
|---|---|
| `training_coordinator` | Training & certifications |
| `medical_coordinator` | Medical inventory |
| `hardware_manager` | Security / facility hardware |
| `event_coordinator` | Events & coverage requests |
| `pastor` | Executive read-only visibility |

### Campus (unchanged enum; templated separately)

`campus_administrator` · `campus_security_leader` (+ existing campus roles)

---

## Member status

### Retained DB values (backward compatible)

| DB value | Display |
|---|---|
| `active` | Active |
| `invited` | Pending Invitation |
| `suspended` | Suspended |
| `removed` | Removed (legacy terminal) |

### Added

| DB value | Display | Login | Assignment eligible |
|---|---|---|---|
| `inactive` | Inactive | No | No |
| `pending_approval` | Pending Approval | No | No |
| `on_leave` | On Leave | No | Yes (schedules only; no login) |
| `archived` | Archived | No | No |

Eligibility rules (app + helpers):

- **Login / active church context:** `active` only
- **Assignable to ops (schedules, events):** `active` or `on_leave`
- Roles never gate login

---

## Rank policy (specialists vs `hasMinRole`)

Specialist roles use ranks **below** `security_member` so they do not inherit security ops via linear `hasMinRole`:

| Role | Rank |
|---|---|
| viewer / pastor | 10 |
| event_coordinator | 15 |
| training_coordinator / medical_coordinator / hardware_manager | 16 |
| security_member | 20 |
| security_leader | 30 |
| administrator | 40 |
| co_owner / owner | 50 |

Long-term: feature gates move to `canUserPerform` / permission keys. Rank remains for legacy helpers during migration.

---

## Permission template source of truth

Table `role_permission_templates`:

- `role_kind`: `church` | `campus`
- `role_key`: text (`training_coordinator`, `campus_administrator`, …)
- `permission_key`: FK to `permission_definitions.permission_key`

Future system roles = `ALTER TYPE` + template rows (no auth-engine code change).  
Custom church-defined roles (Duplicate/Deactivate UI) deferred to Phase 3/4 and may introduce church-scoped `role_definitions` later.

TS mirrors templates in:

- `ROLE_PERMISSION_MAPPING`
- `CAMPUS_ROLE_PERMISSION_MAPPING`

---

## Authorization flow (Phase 2 delta)

1. Resolve active membership (`status = active`)
2. Load active roles from `church_membership_roles` (fallback: primary column)
3. Union role-default permissions from templates
4. Union group grants; apply user DENY (existing)
5. Campus scope filter (existing; campus-role template merge optional later when `campusId` present)

---

## Auditing (new event types)

- `role.created` / `role.updated` / `role.deactivated` (reserved for role catalog UI)
- `membership_role.assigned` / `membership_role.removed` / `membership_role.primary_changed`
- `membership.status_changed`
- `campus_assignment.changed`
- `permission_override.changed`

---

## Migration plan

1. Apply `068_church_roles_status_expansion.sql` (enums, junction, sync triggers, backfill, helpers, audit enum values)
2. Apply `069_role_permission_templates.sql` (new permission keys, templates seed)
3. Deploy app with updated TS (no UI required)
4. Existing churches: every membership gets one primary junction row; behavior unchanged
5. Phase 3+: Roles UI, member secondary-role editor, wire `requirePermission`, harden engine bugs, tighten RLS

---

## Backward compatibility

- Existing six roles unchanged in meaning
- Existing status values retained
- `church_memberships.role` kept and synced
- No automatic role remapping of live users
- Campus Administrator / Campus Security Leader continue via campus membership assignments
