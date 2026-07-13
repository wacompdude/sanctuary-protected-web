# Phase 7 — RLS Test Plan

Manual checks to run in the Supabase SQL editor (or a scripted test harness) **after** `013_rls_hardening.sql` is approved and applied. Use two churches and several memberships.

## Fixtures

Create (as service role / dashboard SQL):

| User | Church A role | Church B role |
|------|---------------|---------------|
| `owner_a` | owner (active) | — |
| `admin_a` | administrator (active) | — |
| `leader_a` | security_leader (active) | — |
| `viewer_a` | viewer (active) | — |
| `suspended_a` | security_member (**suspended**) | — |
| `owner_b` | — | owner (active) |

Seed at least one campus + one audit log row per church.

For each case below, `SET LOCAL ROLE authenticated` and set JWT claims so `auth.uid()` is the fixture user (Supabase: use the Auth API as that user, or `request.jwt.claim.sub`).

---

## 1. Church A users cannot access Church B

As `owner_a`:

```sql
-- Expect: Church A row only
SELECT id, name FROM churches;

-- Expect: 0 rows
SELECT * FROM campuses WHERE church_id = '<church_b_id>';
SELECT * FROM audit_logs WHERE church_id = '<church_b_id>';
SELECT * FROM church_memberships WHERE church_id = '<church_b_id>';
```

As `owner_b`, confirm the inverse (no Church A campus/audit/membership roster beyond own memberships if any).

**Pass:** Cross-tenant SELECTs return empty; no UPDATE on the other church’s campuses.

---

## 2. Suspended members lose access

As `suspended_a`:

```sql
-- Expect: can see own membership row (status = suspended)
SELECT id, status, role FROM church_memberships WHERE user_id = auth.uid();

-- Expect: 0 rows / denied
SELECT * FROM campuses WHERE church_id = '<church_a_id>';
SELECT * FROM audit_logs WHERE church_id = '<church_a_id>';
SELECT * FROM incidents WHERE church_id = '<church_a_id>'; -- if incidents RLS uses is_active helper
```

**Pass:** Church-scoped data is inaccessible; only own membership (and own profile) remain readable.

---

## 3. Viewers cannot modify records

As `viewer_a`:

```sql
-- Expect: FAIL
UPDATE churches SET name = name || ' x' WHERE id = '<church_a_id>';
INSERT INTO campuses (church_id, name, timezone) VALUES ('<church_a_id>', 'X', 'UTC');
UPDATE church_memberships SET role = 'administrator' WHERE church_id = '<church_a_id>' AND role = 'viewer';
INSERT INTO church_invitations (/* ... */) VALUES (/* ... */);
UPDATE audit_logs SET action = 'tampered' WHERE church_id = '<church_a_id>';
DELETE FROM audit_logs WHERE church_id = '<church_a_id>';
```

**Pass:** All mutations rejected by RLS and/or audit triggers.

---

## 4. Administrators cannot become owners without owner authorization

As `admin_a`:

```sql
-- Expect: FAIL (self role change blocked)
UPDATE church_memberships
SET role = 'owner'
WHERE church_id = '<church_a_id>' AND user_id = auth.uid();

-- Expect: FAIL (admin cannot promote another user to owner)
UPDATE church_memberships
SET role = 'owner'
WHERE church_id = '<church_a_id>' AND user_id = '<viewer_a_id>';
```

As `owner_a`:

```sql
-- Expect: SUCCESS (second owner allowed)
UPDATE church_memberships
SET role = 'owner'
WHERE church_id = '<church_a_id>' AND user_id = '<admin_a_id>';
```

Then as `owner_a`, demote back if needed. Confirm last-owner protection:

```sql
-- With only one active owner left — Expect: FAIL
UPDATE church_memberships
SET status = 'removed'
WHERE church_id = '<church_a_id>' AND role = 'owner' AND status = 'active';
```

**Pass:** Only owners can assign owner; last active owner cannot be removed/demoted.

---

## 5. Owners can manage authorized church settings

As `owner_a`:

```sql
-- Expect: SUCCESS
UPDATE churches
SET primary_email = 'ops@example.com'
WHERE id = '<church_a_id>';

UPDATE campuses
SET name = 'Main Campus'
WHERE church_id = '<church_a_id>';
```

As `viewer_a` / `leader_a` (security_leader):

```sql
-- Expect: FAIL for church settings / campus create-update
UPDATE churches SET phone = '555' WHERE id = '<church_a_id>';
```

**Pass:** Owner (and administrator via `can_manage_church_settings`) succeed; lower roles fail.

---

## 6. Audit logs cannot be edited by ordinary users

As `owner_a` and as `viewer_a`:

```sql
-- Expect: FAIL (no policy + BEFORE trigger)
UPDATE audit_logs SET metadata = '{}'::jsonb WHERE church_id = '<church_a_id>';
DELETE FROM audit_logs WHERE church_id = '<church_a_id>';
```

Optional positive check:

```sql
-- Expect: SUCCESS for active member inserting own user_id
INSERT INTO audit_logs (church_id, user_id, action, entity_type)
VALUES ('<church_a_id>', auth.uid(), 'test.ping', 'test');
```

**Pass:** UPDATE/DELETE always fail for authenticated; INSERT only for self + active church.

---

## Extra spot checks (recommended)

| Case | Actor | Expect |
|------|--------|--------|
| Security leader assigns `owner` via INSERT membership | `leader_a` | FAIL |
| Security leader invites `administrator` | `leader_a` | FAIL |
| Security leader invites `viewer` | `leader_a` | SUCCESS |
| Member tries to set own status to `active` while suspended | `suspended_a` | FAIL |
| Cross-church UPDATE campus | `owner_a` on B campus | FAIL |

---

## Sign-off

- [ ] Migration reviewed
- [ ] Applied to staging / local Supabase
- [ ] Cases 1–6 passed
- [ ] Extra spot checks passed
- [ ] App smoke: login, dashboard, onboarding still work for an active owner
