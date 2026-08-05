# Industry-Generic Backend / Industry-Specific UI

Status: **Phases A–D applied; optional cleanup ready (076–078)**  
Goal: Backend, schema, and service APIs use **Organization** terminology. The Sanctuary Protected **UI** remains church-specific (labels, routes, help copy).

---

## Target model

| Layer | Terminology |
|---|---|
| Database tables | `organizations`, `organization_memberships`, … (071) |
| Database columns | `organization_id`, … (072) |
| SQL functions | `organization_*` (073; wrappers removed in 075) |
| SQL enums | `organization_*` (074) |
| SQL params | `p_organization_id` / `requested_organization_id` (076) |
| Storage paths | `organizations/{id}/…` (077 dual-read; 078 rewrite) |
| TypeScript domain | `lib/organization/*` (`lib/church/*` re-exports) |
| Customer UI | Church, Churches, `/settings/church`, Switch Church, … |

---

## Optional cleanup deploy order

1. **Run `077`** — dual-read Storage path helpers (`churches/` + `organizations/`)
2. **Run `076`**, then **deploy the app** immediately  
   - App sends `p_organization_id` in RPCs  
   - `lib/organization` is canonical; `lib/church` is thin re-exports
3. Smoke-test login, Team, create church, logo upload

### Storage prefix note

`078` updated `storage.objects.name` in SQL only — that does **not** rename S3
blobs, so logos 404’d. **Run `079`** to revert metadata to `churches/`.

New uploads stay on `churches/` until a Storage **move/copy API** migration exists.
Dual-read helpers from `077` remain (both prefixes accepted).

Bucket id `church-branding` is unchanged.

---

## Explicitly out of scope (unless requested)

- Renaming customer routes (`/settings/church`, `/platform/churches`)
- Renaming UI components (`ChurchSwitcher`, …)
- Rewriting Help Center / email marketing copy
- Renaming Storage bucket ids (`church-branding`, …)
- Changing product positioning

---

## Safety

- No blind replace of the word `church`
- 076 uses rename-aside + rebind (never `DROP … CASCADE`)
- 077 before new `organizations/` writes; 078 after app deploy
