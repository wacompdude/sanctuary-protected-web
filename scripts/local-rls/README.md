# Stage 3A-3 local RLS harness (disposable)

**Never** point these scripts at Production. Target is `127.0.0.1:54322` only.

## Why a fixture?

Greenfield `supabase start` with full migrations fails at `072_rename_church_columns_to_organization.sql`
(`function public.__keep_fn_name_6__() does not exist`). Production already applied 072 historically,
so this does not block applying migration 117 to Production after Stage 3A closeout approval.

## Procedure

1. Ensure Docker Desktop Linux engine is up (`docker info` shows Server Version).
2. Temporarily set `[db.migrations] enabled = false` in `supabase/config.toml`.
3. `npx supabase start` (local only — no `--linked`).
4. Apply `01_minimal_schema_pre_117.sql` then `supabase/migrations/117_security_group_tenant_isolation.sql` via local `psql` to port **54322**.
5. `node scripts/local-rls/write-status.mjs` then `node scripts/local-rls/02_seed_and_rls_tests.mjs`.
6. Optional Stage 3B: `node scripts/local-rls/03_password_recovery_smoke.mjs` (synthetic user only).
7. Restore `[db.migrations] enabled = true` immediately after.
8. Delete `_local_status.json` if present (contains local demo keys).

## Safety

- Do not run `supabase db push --linked` or `db reset --linked`.
- Do not copy Production customer data.
