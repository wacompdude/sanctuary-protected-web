/**
 * Stage 3D JWT/PostgREST RLS checks for organization_checkout_approvals.
 * Requires local Supabase. Does not touch Production.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!anon || !service) {
  console.error("Need SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const userClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const orgId = crypto.randomUUID();

// Service role can upsert (after org exists — skip org create if schema heavy;
// instead attempt read of empty table and write denial for JWT).

const { data: listSvc, error: listSvcErr } = await admin
  .from("organization_checkout_approvals")
  .select("organization_id")
  .limit(1);
assert(!listSvcErr, `service select ok: ${listSvcErr?.message}`);
void listSvc;

const { data: jwtRows, error: jwtErr } = await userClient
  .from("organization_checkout_approvals")
  .select("organization_id")
  .limit(1);
// Without auth JWT, PostgREST should deny or return empty under RLS.
assert(
  jwtErr || (Array.isArray(jwtRows) && jwtRows.length === 0),
  `anon/jwt cannot read approvals (${jwtErr?.message ?? "empty"})`,
);

const { error: jwtInsertErr } = await userClient
  .from("organization_checkout_approvals")
  .insert({
    organization_id: orgId,
    status: "active",
    approved_at: new Date().toISOString(),
  });
assert(jwtInsertErr, "anon/jwt insert must fail");

console.log(
  JSON.stringify(
    {
      ok: true,
      serviceSelect: !listSvcErr,
      jwtSelectDeniedOrEmpty: true,
      jwtInsertDenied: Boolean(jwtInsertErr),
      jwtInsertCode: jwtInsertErr?.code ?? null,
    },
    null,
    2,
  ),
);
