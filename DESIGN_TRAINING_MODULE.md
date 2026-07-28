# Training Management Module — Design

## Phase 1 summary (existing app)

- **Stack**: Next.js App Router, Supabase, server actions, church membership auth, subscription entitlements (`FEATURE_KEYS` + `plan_features`), Security permission catalog (`permission_definitions`).
- **Certifications twin**: `app/(app)/certifications`, `lib/certifications/*`, expiration notifications — remains separate; optional link via `creates_certification` on courses.
- **Identity**: Prefer `church_memberships.user_id` for participants (login users). Certification contacts (`team_members`) stay separate.
- **Tier gating pattern**: boolean feature key + `requireFeature` on every server action/page + `NAV_FEATURE_REQUIREMENTS` for menu.
- **Permissions**: Expand beyond existing `training.view` / `training.manage` with granular keys; enforce with role helpers initially plus `requireFeature`; wire `requirePermission` where practical.
- **Reuse**: Policy attachment storage pattern, audit_logs, notification createNotification, schedule calendar UI patterns, Security campus scope concepts.
- **Collision**: Schedule `event_type: "training"` stays operational scheduling; this module is LMS-style documentation (`/training`).

## Phase 2 architecture

### Feature entitlement
- Key: `training.management.enabled`
- Plans: **false** for Servant Standard; **true** for Steward Pro, Shepherd Plus, Omni Enterprise
- Platform admin can change via existing `plan_features` / features tables
- Downgrade: access blocked; rows retained

### Permissions (additive)
Granular keys under category `training` (view/manage/events/courses/attendance/requirements/reports/sensitive/settings). Sensitive category “Lethal and Non-Lethal Training” requires `training.sensitive.*`.

### Data model (church-scoped)
- `training_categories` (system + church custom)
- `training_courses`
- `training_events`
- `training_event_assignments`
- `training_participants`
- `training_requirements`
- `training_completion_records` (immutable history; corrections audited)
- `training_documents`
- `training_external_records`
- `training_church_settings` (due-soon days, reminder prefs)

### Routes
`/training` dashboard + children: events, courses, calendar, records, required, reports, settings. Nested event detail for attendance.

### Authz pipeline (every action)
1. Authenticated membership  
2. Church operational  
3. `requireFeature(TRAINING_MANAGEMENT)`  
4. Role / permission check  
5. Campus filter on queries  
6. Sensitive category gate when applicable  

### Cert integration
Course flag `creates_certification` + optional cert type mapping; on completion, create/update certification when enabled (no duplicates).

### MVP delivery order
1. Migrations + feature + permissions + nav  
2. Categories/courses seed + CRUD  
3. Events + participants + attendance + completion history  
4. Dashboard metrics + calendar list + required training  
5. Reports/transcript export (CSV/print)  
6. Documents + external training + notifications (follow-on)

## Known limitations (v1)
- QR check-in deferred  
- Full PDF branding deferred (print/CSV first)  
- SMS/push notification channels deferred  
- Bulk CSV import deferred  
- Cost fields stored but UI limited to managers  
- Dual-approval workflows deferred  
