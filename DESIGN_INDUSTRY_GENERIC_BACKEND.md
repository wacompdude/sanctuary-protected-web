# Industry-Generic Backend / Industry-Specific UI

Status: **Phases A–C applied; Phase D ready to deploy**  
Goal: Backend, schema, and service APIs use **Organization** terminology. The Sanctuary Protected **UI** remains church-specific (labels, routes, help copy).

---

## Target model

| Layer | Terminology |
|---|---|
| Database tables | `organizations`, `organization_memberships`, … (done — 071) |
| Database columns | `organization_id`, … (done — 072) |
| SQL functions | `organization_*` (done — 073; wrappers removed in 075) |
| SQL enums | `organization_*` (done — 074) |
| TypeScript domain / services | `organizationId`, `Organization`, `getActiveOrganization` |
| Customer UI | Church, Churches, `/settings/church`, Switch Church, … |

Presentation mapping:

```text
Organization (internal)  →  Church (UI)
organizationId           →  shown as “church” in copy only
```

---

## Phases

### Phase A — TypeScript identifiers ✅

- `churchId` → `organizationId` (~217 files)
- Domain `Organization` canonical; `Church` / `ChurchMembership` aliases retained
- Helpers: `getActiveOrganization`, `requireOrganizationMembership`, … with Church aliases
- Cookie: writes `sp_active_organization_id`, still reads legacy `sp_active_church_id`
- UI routes / labels / component names unchanged

### Phase B — SQL function names ✅ (073 applied)

- File: `supabase/migrations/073_rename_church_functions_to_organization.sql`
- Renames `*church*` functions → `*organization*`
- Recreated old names as wrappers (except `RETURNS trigger` — rename only)
- Rollback: `supabase/migrations/rollback/073_*.sql`

### Phase C — SQL enums ✅ (074 applied)

- File: `supabase/migrations/074_rename_church_enums_to_organization.sql`
- `church_status` → `organization_status`, etc. (values unchanged)

### Phase D — Cleanup ✅ (code ready; order matters)

1. **App** points `.rpc` at `organization_*` names (param names like `p_church_id` kept)
2. **Deploy app first** (wrappers from 073 still satisfy old callers during rollout)
3. **Then apply** `supabase/migrations/075_drop_church_function_wrappers.sql`
   - Rewrites RLS / Storage policies to `organization_*`
   - Rewrites function bodies that still called wrappers
   - Drops `church_*` wrappers

Deferred (optional later):

- `lib/church/` → `lib/organization/` with UI re-exports
- Rename `p_church_id` params (requires DROP FUNCTION or new overloads)
- Storage path prefix `churches/`

---

## Explicitly out of scope (unless requested)

- Renaming customer routes (`/settings/church`, `/platform/churches`)
- Renaming UI components (`ChurchSwitcher`, …)
- Rewriting Help Center / email marketing copy
- Moving Storage objects out of `churches/`
- Changing product positioning

---

## Safety

- No blind replace of the word `church`
- Coordinated deploy: app RPC rename **before** dropping wrappers (075)
- Preserve `p_church_id` until a dedicated param-rename migration
