# Training Management Module — Phase 6 Review

## Summary

Training Management is implemented as a distinct module from Certifications, gated to **Steward Pro**, **Shepherd Plus**, and **Omni Enterprise** via `training.management.enabled`. Backend `requireFeature` and frontend layout upgrade gate both enforce access. Downgrade blocks access only; data is retained.

## Completed work

### Database
- `062_training_management.sql` — categories, courses, events, assignments, participants, requirements, completion records, external records, documents, church settings, RLS, system category/topic seeds
- `063_training_entitlements.sql` — feature key + plan mapping + granular `training.*` permissions

### Feature / nav / permissions
- `FEATURE_KEYS.TRAINING_MANAGEMENT`
- Expected matrix for all four plans
- Nav group **Training** next to Certifications (dashboard, events, courses, calendar, records, required, reports, settings)
- Protected path `/training`
- Sidebar `GraduationCap` icons
- Expanded `PERMISSION_KEYS` + role mappings

### Backend (`lib/training/*`)
- Access, permissions, renewal/completion helpers, queries, audit wrappers
- Server actions with session church scoping, feature gate, role checks
- Completion history with denormalized names; cancelled events skip completions
- Optional certification creation without duplicates

### Frontend
- Full `/training` route tree with working forms (events, attendance, courses, categories, requirements, external training, settings, reports CSV, transcripts)
- Upgrade message: *Training Management is available with Steward Pro, Shepherd Plus, and Omni Enterprise plans.*

### Tests
- `npm run selfcheck:training` — tier matrix, roles, renewal, completion rules
- Vitest-style files under `lib/training/__tests__` (excluded from `tsc`; run via selfcheck)

## Design doc
- `DESIGN_TRAINING_MODULE.md`

## Known limitations / deferred
- QR check-in
- Branded PDF export (print/CSV available)
- SMS/push notification channels (email framework reuse deferred for v1 cron)
- Bulk CSV participant import
- Full `requirePermission` DB path on every action (role helpers + feature gate today; permission keys catalogued for Security UI)
- Member profile “Training” tab (transcript route exists at `/training/transcript/[userId]`)
- Cost UI limited; cost columns exist
- Drill after-action deep UI (columns supported on events)
- Document upload UI (table + storage isolation pattern reserved)

## Security considerations
- Multi-tenant RLS on church-scoped tables; system catalog readable to authenticated
- Sensitive category (Lethal and Non-Lethal) filtered unless `canViewSensitive`
- Server-derived church ID; campus filter via existing campus filter helpers
- No hard delete of completion history in normal flows
- Audit actions for create/update/cancel/completion/settings/external verify

## Apply before use
Run migrations `062` and `063` against Supabase, then confirm Steward Pro+ churches see **Training** in nav.

## Recommended next improvements
1. Wire `requirePermission` for churches using Security groups
2. Document upload using existing policy/storage pattern
3. Reminder cron for due-soon / overdue required training
4. Member profile Training tab
5. Expand automated integration tests against a test DB for campus isolation and file tenancy
