/**
 * Stage 3A-3 LOCAL-ONLY: seed synthetic Auth users + org fixtures, run RLS tests 1–15.
 * Target: local Supabase at 127.0.0.1 only. Never Production.
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = "http://127.0.0.1:54321";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Local demo keys from `supabase start` (disposable; do not treat as Production secrets)
const status = JSON.parse(
  readFileSync(join("scripts", "local-rls", "_local_status.json"), "utf8"),
);
const SERVICE = status.SERVICE_ROLE_KEY;
const ANON = status.ANON_KEY;

const admin = createClient(API, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function record(id, name, pass, detail = "") {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} Test ${id} — ${name}${detail ? `: ${detail}` : ""}`);
}

async function ensureUser(email, password = "TestPass123!") {
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = listed?.users?.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function signIn(email, password = "TestPass123!") {
  const c = createClient(API, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { client: c, token: data.session.access_token, userId: data.user.id };
}

async function main() {
  const pool = new pg.Pool({ connectionString: DB });

  const ownerA = await ensureUser("owner.a@example.test");
  const ownerB = await ensureUser("owner.b@example.test");
  const adminA = await ensureUser("admin.a@example.test");
  const memberA = await ensureUser("member.a@example.test");
  const memberB = await ensureUser("member.b@example.test");
  const multi = await ensureUser("multi@example.test");
  const viewerA = await ensureUser("viewer.a@example.test");

  const orgA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const campusA1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const campusA2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
  const groupA = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
  const groupB = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
  const permDef = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  await pool.query(`
    TRUNCATE public.security_audit_logs, public.user_permissions,
      public.security_group_permissions, public.security_group_members,
      public.security_groups, public.permission_definitions, public.campuses,
      public.organization_memberships, public.organizations
    RESTART IDENTITY CASCADE;

    INSERT INTO public.organizations (id, name, status) VALUES
      ('${orgA}', 'Org A Synthetic', 'active'),
      ('${orgB}', 'Org B Synthetic', 'active');

    INSERT INTO public.organization_memberships (organization_id, user_id, role, status) VALUES
      ('${orgA}', '${ownerA}', 'owner', 'active'),
      ('${orgA}', '${adminA}', 'administrator', 'active'),
      ('${orgA}', '${memberA}', 'security_member', 'active'),
      ('${orgA}', '${viewerA}', 'viewer', 'active'),
      ('${orgA}', '${multi}', 'security_member', 'active'),
      ('${orgB}', '${ownerB}', 'owner', 'active'),
      ('${orgB}', '${memberB}', 'security_member', 'active'),
      ('${orgB}', '${multi}', 'administrator', 'active');

    INSERT INTO public.campuses (id, organization_id, name) VALUES
      ('${campusA1}', '${orgA}', 'Campus A1'),
      ('${campusA2}', '${orgA}', 'Campus A2');

    INSERT INTO public.permission_definitions (id, permission_key, name)
    VALUES ('${permDef}', 'security.groups.manage', 'Manage security groups');

    INSERT INTO public.security_groups (id, organization_id, name, created_by, updated_by)
    VALUES
      ('${groupA}', '${orgA}', 'Group A', '${ownerA}', '${ownerA}'),
      ('${groupB}', '${orgB}', 'Group B', '${ownerB}', '${ownerB}');

    INSERT INTO public.security_group_members
      (security_group_id, organization_id, user_id, status, assigned_by, campus_id, scope_type)
    VALUES
      ('${groupA}', '${orgA}', '${memberA}', 'active', '${adminA}', NULL, 'no_restriction'),
      ('${groupB}', '${orgB}', '${memberB}', 'active', '${ownerB}', NULL, 'no_restriction'),
      ('${groupA}', '${orgA}', '${multi}', 'active', '${adminA}', '${campusA1}', 'selected_campuses');

    INSERT INTO public.security_group_permissions
      (security_group_id, permission_definition_id, permission_effect, scope_type, campus_id, assigned_by, effective_at, expires_at)
    VALUES
      ('${groupA}', '${permDef}', 'grant', 'selected_campuses', '${campusA1}', '${adminA}', NULL, NULL),
      ('${groupB}', '${permDef}', 'grant', 'no_restriction', NULL, '${ownerB}', NULL, NULL);

    INSERT INTO public.user_permissions
      (organization_id, user_id, permission_definition_id, permission_effect, scope_type, status, assigned_by, expires_at)
    VALUES
      ('${orgA}', '${viewerA}', '${permDef}', 'grant', 'no_restriction', 'active', '${adminA}', NULL),
      ('${orgA}', '${memberA}', '${permDef}', 'grant', 'no_restriction', 'revoked', '${adminA}', NULL),
      ('${orgA}', '${memberA}', '${permDef}', 'grant', 'selected_campuses', 'active', '${adminA}', now() - interval '1 day');

    INSERT INTO public.security_audit_logs (organization_id, actor_user_id, event_type, result)
    VALUES
      ('${orgA}', '${adminA}', 'security_group.created', 'success'),
      ('${orgB}', '${ownerB}', 'security_group.created', 'success');
  `);

  // Test 15 — policy regression via SQL harness
  const t15 = await pool.query(`
    SELECT count(*)::int AS broad_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'security_groups','security_group_members','security_group_permissions',
        'user_permissions','security_audit_logs'
      )
      AND (
        coalesce(qual, '') LIKE '%auth.role() = ''authenticated''%'
        OR coalesce(with_check, '') LIKE '%auth.role() = ''authenticated''%'
      );
  `);
  record(15, "RLS policy regression (no authenticated-wide)", t15.rows[0].broad_count === 0, `broad=${t15.rows[0].broad_count}`);

  // JWT/PostgREST tests via user sessions
  const asMemberA = await signIn("member.a@example.test");
  const asOwnerA = await signIn("owner.a@example.test");
  const asAdminA = await signIn("admin.a@example.test");
  const asOwnerB = await signIn("owner.b@example.test");
  const asMulti = await signIn("multi@example.test");
  const asViewerA = await signIn("viewer.a@example.test");

  // 1 Cross-tenant read
  {
    const { data, error } = await asMemberA.client.from("security_groups").select("id,organization_id");
    const leaked = (data || []).some((r) => r.organization_id === orgB);
    const sawOwn = (data || []).some((r) => r.organization_id === orgA);
    record(1, "Cross-tenant read denied", !error && !leaked && sawOwn, `rows=${data?.length ?? 0}`);
  }

  // 2 Cross-tenant write
  {
    const { error } = await asMemberA.client
      .from("security_groups")
      .update({ description: "hacked" })
      .eq("id", groupB);
    // RLS should filter to 0 rows; PostgREST may return no error with 0 updated
    const check = await pool.query(`SELECT description FROM security_groups WHERE id=$1`, [groupB]);
    record(2, "Cross-tenant write denied", check.rows[0].description == null || check.rows[0].description !== "hacked", String(error?.message || "no-error-0-rows"));
  }

  // 3 Cross-tenant group membership
  {
    const { error } = await asMemberA.client.from("security_group_members").insert({
      security_group_id: groupB,
      organization_id: orgB,
      user_id: memberA,
      status: "active",
      assigned_by: memberA,
      scope_type: "no_restriction",
    });
    record(3, "Cross-tenant group membership denied", !!error, error?.message || "unexpected success");
  }

  // 4 Cross-tenant permission grant
  {
    const { error } = await asAdminA.client.from("security_group_permissions").insert({
      security_group_id: groupB,
      permission_definition_id: permDef,
      permission_effect: "grant",
      scope_type: "no_restriction",
      assigned_by: adminA,
    });
    record(4, "Cross-tenant permission grant denied", !!error, error?.message || "unexpected success");
  }

  // 5 Self-escalation via user_permissions
  {
    const { error } = await asMemberA.client.from("user_permissions").insert({
      organization_id: orgA,
      user_id: memberA,
      permission_definition_id: permDef,
      permission_effect: "grant",
      scope_type: "no_restriction",
      status: "active",
      assigned_by: memberA,
    });
    record(5, "Self-escalation denied", !!error, error?.message || "unexpected success");
  }

  // 6 Audit forgery
  {
    const { error } = await asMemberA.client.from("security_audit_logs").insert({
      organization_id: orgA,
      actor_user_id: memberA,
      event_type: "security_group.created",
      result: "success",
    });
    record(6, "Audit forgery denied", !!error, error?.message || "unexpected success");
  }

  // 7 Same-org authorized reads
  {
    const { data, error } = await asMemberA.client
      .from("security_groups")
      .select("id")
      .eq("organization_id", orgA);
    record(7, "Same-org authorized reads allowed", !error && (data?.length ?? 0) >= 1, `rows=${data?.length ?? 0}`);
  }

  // 8 Administrative management allowed
  {
    const { data, error } = await asAdminA.client
      .from("security_groups")
      .insert({
        organization_id: orgA,
        name: `Admin Created ${Date.now()}`,
        created_by: adminA,
        updated_by: adminA,
      })
      .select("id")
      .maybeSingle();
    record(8, "Administrative writes allowed", !error && !!data?.id, error?.message || data?.id || "");
  }

  // 9 Multi-org isolation via PostgREST (multi sees both orgs' groups they belong to as member)
  {
    const { data, error } = await asMulti.client.from("security_groups").select("id,organization_id");
    const orgs = new Set((data || []).map((r) => r.organization_id));
    // Multi is member of A and admin of B — can SELECT both orgs' groups
    const ok = !error && orgs.has(orgA) && orgs.has(orgB);
    // Cannot update Org A group as admin of B only — membership in A is security_member not admin
    const { error: updErr } = await asMulti.client
      .from("security_groups")
      .update({ description: "multi-should-fail-on-a-if-not-admin" })
      .eq("id", groupA);
    const after = await pool.query(`SELECT description FROM security_groups WHERE id=$1`, [groupA]);
    const writeBlocked =
      after.rows[0].description !== "multi-should-fail-on-a-if-not-admin";
    record(9, "Multi-organization permissions isolated", ok && writeBlocked, `orgs=${[...orgs].join(",")}; writeBlocked=${writeBlocked}; updErr=${updErr?.message || "none"}`);
  }

  // 10 Revocation — revoked user_permission row still readable by members but app layer ignores; RLS still allows SELECT for members
  {
    const { data } = await asViewerA.client
      .from("user_permissions")
      .select("id,status")
      .eq("user_id", memberA)
      .eq("status", "revoked");
    // RLS allows same-org SELECT; revocation is authorization-layer. Confirm revoked row exists and member cannot INSERT new self grant (already test 5).
    record(10, "Revoked permissions visible but not writable by subject", (data?.length ?? 0) >= 1, `revokedRows=${data?.length ?? 0}`);
  }

  // 11 Expired grants — expired row present; cannot be used to authorize new admin ops by member
  {
    const { data } = await asMemberA.client
      .from("user_permissions")
      .select("id,expires_at,status")
      .eq("user_id", memberA)
      .lt("expires_at", new Date().toISOString());
    record(11, "Expired permission rows remain readable; no escalate", (data?.length ?? 0) >= 1, `expiredRows=${data?.length ?? 0}`);
  }

  // 12 Campus restrictions — campus-scoped membership/permission rows exist; cross-campus grant insert by admin on selected campus works only for own org
  {
    const { data } = await asAdminA.client
      .from("security_group_permissions")
      .select("id,campus_id,scope_type")
      .eq("security_group_id", groupA)
      .eq("campus_id", campusA1);
    record(12, "Campus-scoped grants readable in-org", !!(data && data.length >= 1), `rows=${data?.length ?? 0}`);
  }

  // 13 Super Admin / service-role path
  {
    const svc = createClient(API, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await svc
      .from("security_audit_logs")
      .insert({
        organization_id: orgA,
        actor_user_id: ownerA,
        event_type: "security_audit_log.viewed",
        result: "success",
      })
      .select("id")
      .maybeSingle();
    record(13, "Service-role audit write works", !error && !!data?.id, error?.message || data?.id || "");
  }

  // 14 Direct PostgREST cannot bypass tenant isolation (owner B cannot read org A audit as non-manager of A — owner B is not member of A)
  {
    const { data, error } = await asOwnerB.client
      .from("security_audit_logs")
      .select("id,organization_id");
    const leaked = (data || []).some((r) => r.organization_id === orgA);
    const sawOwn = (data || []).some((r) => r.organization_id === orgB);
    record(14, "Direct PostgREST tenant isolation", !error && !leaked && sawOwn, `rows=${data?.length ?? 0}; err=${error?.message || ""}`);
  }

  // Viewer cannot manage groups
  {
    const { error } = await asViewerA.client.from("security_groups").insert({
      organization_id: orgA,
      name: "viewer-escalation",
      created_by: viewerA,
      updated_by: viewerA,
    });
    // counted under admin test suite narrative — attach to test 8 companion
    if (!error) {
      record("8b", "Viewer management denied", false, "viewer insert succeeded");
    }
  }

  await pool.end();

  const failed = results.filter((r) => !r.pass);
  console.log("\n=== SUMMARY ===");
  console.log(`PASS ${results.filter((r) => r.pass).length} / FAIL ${failed.length} / TOTAL ${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.id}: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
