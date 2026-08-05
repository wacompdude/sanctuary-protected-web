# Industry-Generic Backend / Industry-Specific UI

Status: **Phase A in progress / Phase B–C SQL drafted**  
Goal: Backend, schema, and service APIs use **Organization** terminology. The Sanctuary Protected **UI** remains church-specific (labels, routes, help copy).

---

## Target model

| Layer | Terminology |
|---|---|
| Database tables | `organizations`, `organization_memberships`, … (done — 071) |
| Database columns | `organization_id`, … (done — 072) |
| SQL enums / functions | `organization_*` (Phase B — pending) |
| TypeScript domain / services | `organizationId`, `Organization`, `getActiveOrganization` |
| Customer UI | Church, Churches, `/settings/church`, Switch Church, … |

Presentation mapping:

```text
Organization (internal)  →  Church (UI)
organizationId           →  shown as “church” in copy only
```

---

## Phases

### Phase A — TypeScript identifiers ✅ (code on branch)

- `churchId` → `organizationId` (~217 files)
- Domain `Organization` canonical; `Church` / `ChurchMembership` aliases retained
- Helpers: `getActiveOrganization`, `requireOrganizationMembership`, … with Church aliases
- Cookie: writes `sp_active_organization_id`, still reads legacy `sp_active_church_id`
- UI routes / labels / component names unchanged

### Phase B — SQL function names (drafted, not applied)

- File: `supabase/migrations/073_rename_church_functions_to_organization.sql`
- Renames ~41 `*church*` functions → `*organization*`
- Recreates old names as wrappers (RLS / Storage / `.rpc("…church…")` keep working)
- Rollback: `supabase/migrations/rollback/073_*.sql`

### Phase C — SQL enums (drafted, not applied)

- File: `supabase/migrations/074_rename_church_enums_to_organization.sql`
- `church_status` → `organization_status`, etc. (values unchanged)

### Phase D — Cleanup (later)

- Point app `.rpc` calls at organization_* names; remove church_* wrappers when unused
- Optional: `lib/church/` → `lib/organization/` with UI re-exports
- Optional: rename `p_church_id` params (requires DROP FUNCTION or new overloads)

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
- Preserve `p_church_id` until Phase B SQL lands
- Coordinated deploy for any SQL rename (same as 071/072)
