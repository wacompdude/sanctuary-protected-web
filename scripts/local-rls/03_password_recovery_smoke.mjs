/**
 * Stage 3B LOCAL-ONLY password recovery smoke against disposable Supabase.
 * Does not target Production.
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const out = execSync("npx supabase status -o env", { encoding: "utf8" });
const env = {};
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const API = env.API_URL;
const SERVICE = env.SERVICE_ROLE_KEY;
const ANON = env.ANON_KEY;
if (!API || !SERVICE || !ANON) {
  console.error("LOCAL_SUPABASE_UNAVAILABLE");
  process.exit(2);
}

const admin = createClient(API, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `reset.smoke.${Date.now()}@example.test`;
const password = "InitialPass123!";
const nextPassword = "UpdatedPass456!";

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) throw createErr;
const userId = created.user.id;

const { data: linkData, error: linkErr } =
  await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
if (linkErr) throw linkErr;

const props = linkData.properties || {};
const tokenHash = props.hashed_token;
if (!tokenHash) {
  console.error("NO_HASHED_TOKEN", Object.keys(props));
  process.exit(1);
}

const anon = createClient(API, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: verifyErr } = await anon.auth.verifyOtp({
  type: "recovery",
  token_hash: tokenHash,
});
if (verifyErr) throw verifyErr;

const { error: updateErr } = await anon.auth.updateUser({
  password: nextPassword,
});
if (updateErr) throw updateErr;

await anon.auth.signOut();

const { error: badLogin } = await anon.auth.signInWithPassword({
  email,
  password,
});
if (!badLogin) {
  console.error("OLD_PASSWORD_STILL_WORKS");
  process.exit(1);
}

const { data: goodLogin, error: goodErr } = await anon.auth.signInWithPassword({
  email,
  password: nextPassword,
});
if (goodErr || !goodLogin.session) throw goodErr || new Error("login failed");

// Reused recovery token should fail
const { error: reuseErr } = await anon.auth.verifyOtp({
  type: "recovery",
  token_hash: tokenHash,
});
if (!reuseErr) {
  console.error("REUSED_TOKEN_ACCEPTED");
  process.exit(1);
}

const { error: junkErr } = await anon.auth.verifyOtp({
  type: "recovery",
  token_hash: "invalid-token-hash-value",
});
if (!junkErr) {
  console.error("JUNK_TOKEN_ACCEPTED");
  process.exit(1);
}

await admin.auth.admin.deleteUser(userId);

writeFileSync(
  "scripts/local-rls/_recovery_smoke_result.json",
  JSON.stringify({
    ok: true,
    emailDomain: "example.test",
    reusedRejected: true,
    junkRejected: true,
    oldPasswordRejected: true,
    newPasswordAccepted: true,
  }),
);
console.log("LOCAL_PASSWORD_RECOVERY_SMOKE_PASS");
