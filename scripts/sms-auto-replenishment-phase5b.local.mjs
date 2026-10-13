/**
 * Local-only PostgreSQL tests for migration 110 SMS auto-replenishment.
 *
 * Host, port, and database name are fixed. This process starts its own
 * loopback cluster and will not connect to another server.
 *
 * Run:
 *   PHASE4B_MODULE_ROOT=<directory outside this repo> npm run selfcheck:sms:auto-replenishment:postgres
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 55432;
const HOST = "127.0.0.1";
const DATABASE = "sms_phase5b";
const USER = "postgres";
const PASSWORD = (process.env.PHASE4B_LOCAL_PASSWORD ?? "").trim() || "phase4b-local-only";
const FORBIDDEN_PROJECT = "dggvkjafqfvocdpyhdsb";
const PERIOD_START = "2026-10-01T00:00:00.000Z";
const PERIOD_END = "2026-11-01T00:00:00.000Z";
const PRIOR_START = "2026-09-01T00:00:00.000Z";
const PRIOR_END = "2026-10-01T00:00:00.000Z";
const PAYMENT_METHOD = "pm_phase5b_local";
const TEXT_VERSION = "sms_auto_replenishment_v1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const moduleRoot = process.env.PHASE4B_MODULE_ROOT;
if (!moduleRoot) {
  console.error("PHASE4B_MODULE_ROOT is required. Refusing to start.");
  process.exit(1);
}

function assertNoRemoteEnvironment() {
  const blob = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_DB_URL,
    process.env.PGHOST,
    process.env.PHASE4B_PGHOST,
    process.env.PHASE4B_LOCAL_PASSWORD,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (
    blob.includes(FORBIDDEN_PROJECT) ||
    blob.includes("supabase.co") ||
    blob.includes("pooler.supabase") ||
    blob.includes("sk_live_") ||
    blob.includes("sk_test_") ||
    blob.includes("service_role")
  ) {
    throw new Error("Refusing to run: environment points at a remote or production credential.");
  }
}

function assertConnectionStringIsLocal(value, database) {
  const lower = value.toLowerCase();
  if (
    lower.includes(FORBIDDEN_PROJECT) ||
    lower.includes("supabase.co") ||
    lower.includes("pooler.supabase") ||
    !lower.includes(`@${HOST}:${PORT}/`) ||
    !lower.endsWith(`/${database}`)
  ) {
    throw new Error("Refusing to run: connection target is not the local Phase 5B database.");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const require = createRequire(path.join(moduleRoot, "package.json"));
const { Client } = require("pg");
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(require.resolve("embedded-postgres")).href
);

async function connect(database = DATABASE) {
  assertConnectionStringIsLocal(
    `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${database}`,
    database,
  );
  const client = new Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database,
  });
  await client.connect();
  return client;
}

async function assertLoopbackServer(client) {
  const { rows } = await client.query(`
    SELECT inet_server_addr()::text AS addr,
           inet_server_port() AS port,
           current_database() AS db,
           current_setting('data_directory') AS data_directory
  `);
  const row = rows[0];
  const addr = String(row.addr ?? "");
  const localAddr = addr.startsWith("127.0.0.1") || addr.startsWith("::1");
  if (!addr || !localAddr) {
    throw new Error(`Refusing to run: inet_server_addr() is not loopback (${addr || "empty"}).`);
  }
  if (Number(row.port) !== PORT) throw new Error(`Refusing to run against port ${row.port}.`);
  if (row.db !== DATABASE && row.db !== "postgres") {
    throw new Error(`Refusing to run against database ${row.db}.`);
  }
  if (String(row.data_directory).toLowerCase().includes(FORBIDDEN_PROJECT)) {
    throw new Error("Refusing to run: data directory matches the production project.");
  }
  return row;
}

async function assertLiveTarget(client) {
  const row = await assertLoopbackServer(client);
  if (row.db !== DATABASE) throw new Error(`Refusing to run against database ${row.db}.`);
  return row;
}

async function bootstrap(admin) {
  await admin.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb,
      raw_user_meta_data jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      aud text,
      role text
    );
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS aud text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role text;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role'::text $$;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY, name text, owner uuid, public boolean DEFAULT false,
      file_size_limit bigint, allowed_mime_types text[], avif_autodetection boolean DEFAULT false,
      owner_id text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz, metadata jsonb, version text, owner_id text, user_metadata jsonb
    );
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL
    );
  `);
}

async function applyMigrations(client) {
  const names = await fs.readdir(migrationsDir);
  const files = names
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .map((name) => ({ name, version: name.slice(0, name.indexOf("_")) }))
    .sort((a, b) => Number(a.version) - Number(b.version) || a.name.localeCompare(b.name));
  const applied = new Set(
    (await client.query(`SELECT version FROM supabase_migrations.schema_migrations`)).rows.map(
      (row) => row.version,
    ),
  );
  await client.query(`SET plpgsql.variable_conflict = use_column`);
  for (const file of files) {
    if (applied.has(file.version)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file.name), "utf8");
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)`,
        [file.version, file.name],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file.name} failed: ${message}`);
    }
  }
  return files.map((file) => file.version);
}

async function rpc(client, fn, args) {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
  const { rows } = await client.query(`SELECT public.${fn}(${placeholders}) AS result`, args);
  return rows[0].result;
}

async function createOrg(client, spec) {
  const slug = `phase5b-${crypto.randomUUID()}`;
  const org = await client.query(
    `INSERT INTO public.organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
    [spec.name, slug],
  );
  const organizationId = org.rows[0].id;
  const plan = await client.query(
    `SELECT id FROM public.subscription_plans WHERE plan_key = $1`,
    [spec.planKey],
  );
  assert(plan.rows[0]?.id, `missing plan ${spec.planKey}`);
  const subscription = await client.query(
    `
    INSERT INTO public.organization_subscriptions (
      organization_id, plan_id, status, current_period_start, current_period_end, started_at
    ) VALUES ($1, $2, $3, $4, $5, $4) RETURNING id
    `,
    [
      organizationId,
      plan.rows[0].id,
      spec.status ?? "active",
      spec.periodStart ?? PERIOD_START,
      spec.periodEnd ?? PERIOD_END,
    ],
  );
  if (spec.used) {
    const feature = await client.query(
      `SELECT id FROM public.features WHERE feature_key = 'messaging.sms.monthly_segment_limit'`,
    );
    await client.query(
      `
      INSERT INTO public.subscription_usage (
        organization_id, subscription_id, feature_id, period_start, period_end,
        quantity_used, quantity_reserved
      ) VALUES ($1, $2, $3, $4, $5, $6, 0)
      `,
      [
        organizationId,
        subscription.rows[0].id,
        feature.rows[0].id,
        spec.periodStart ?? PERIOD_START,
        spec.periodEnd ?? PERIOD_END,
        spec.used,
      ],
    );
  }
  const user = await client.query(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    [`${slug}@example.test`],
  );
  await client.query(
    `
    INSERT INTO public.organization_memberships (
      organization_id, user_id, role, status, joined_at
    ) VALUES ($1, $2, $3, 'active', now())
    `,
    [organizationId, user.rows[0].id, spec.role ?? "owner"],
  );
  if (spec.balance != null) {
    await client.query(
      `
      INSERT INTO public.organization_sms_credit_balances (organization_id, balance, reserved)
      VALUES ($1, $2, $3)
      `,
      [organizationId, spec.balance, spec.reserved ?? 0],
    );
  }
  return {
    organizationId,
    subscriptionId: subscription.rows[0].id,
    planId: plan.rows[0].id,
    userId: user.rows[0].id,
  };
}

async function enable(client, fx, overrides = {}) {
  return rpc(client, "configure_application_sms_auto_replenishment", [
    fx.organizationId,
    fx.userId,
    "enable",
    overrides.threshold ?? 10,
    overrides.cap ?? 5000,
    overrides.paymentMethod ?? PAYMENT_METHOD,
    overrides.version ?? TEXT_VERSION,
  ]);
}

async function claim(client, organizationId) {
  return rpc(client, "claim_application_sms_replenishment", [organizationId]);
}

async function markPending(client, attemptId) {
  await client.query(
    `
    UPDATE public.organization_sms_replenishment_attempts
    SET status = 'payment_pending', payment_pending_at = now()
    WHERE id = $1
    `,
    [attemptId],
  );
}

async function grant(client, attemptId, paymentId, amount, tax = 0) {
  return rpc(client, "record_automatic_application_sms_replenishment", [
    attemptId,
    paymentId,
    amount,
    tax,
    {},
  ]);
}

async function balanceOf(client, organizationId) {
  const { rows } = await client.query(
    `SELECT balance, reserved, auto_replenish_enabled FROM public.organization_sms_credit_balances WHERE organization_id = $1`,
    [organizationId],
  );
  return rows[0] ?? null;
}

async function includedUsed(client, organizationId) {
  const { rows } = await client.query(
    `
    SELECT COALESCE(su.quantity_used, 0)::integer AS used
    FROM public.subscription_usage su
    JOIN public.features f ON f.id = su.feature_id
    WHERE su.organization_id = $1
      AND f.feature_key = 'messaging.sms.monthly_segment_limit'
    `,
    [organizationId],
  );
  return Number(rows[0]?.used ?? 0);
}

const results = [];
async function run(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, pass: false, detail: message });
    console.error(`FAIL ${name}: ${message}`);
  }
}

assertNoRemoteEnvironment();
const moduleRootResolved = path.resolve(moduleRoot);
if (
  moduleRootResolved.toLowerCase().startsWith(repoRoot.toLowerCase()) ||
  moduleRootResolved.toLowerCase().includes(FORBIDDEN_PROJECT)
) {
  throw new Error("Refusing to load database modules from the application or production project.");
}

const postgres = new EmbeddedPostgres({
  databaseDir: path.join(moduleRootResolved, "data"),
  port: PORT,
  user: USER,
  password: PASSWORD,
  persistent: true,
  authMethod: "password",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: (message) => {
    const text = String(message ?? "");
    if (/FATAL|PANIC|ERROR/.test(text)) console.error(text.trim());
  },
  onError: (message) => {
    console.error(message instanceof Error ? message.message : String(message ?? ""));
  },
});

const versionFile = path.join(moduleRootResolved, "data", "PG_VERSION");
let initialized = false;
try {
  await fs.access(versionFile);
  initialized = true;
} catch {
  initialized = false;
}
if (!initialized) await postgres.initialise();
try {
  await postgres.start();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error ?? "postgres start failed"));
  process.exit(1);
}

const admin = await connect("postgres");
await assertLoopbackServer(admin);
const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DATABASE]);
if (exists.rowCount > 0) {
  await admin.query(`DROP DATABASE ${DATABASE} WITH (FORCE)`);
}
await admin.query(`CREATE DATABASE ${DATABASE}`);
await admin.end();

const client = await connect();
const target = await assertLiveTarget(client);
console.log(JSON.stringify({ host: target.addr, port: Number(target.port), database: target.db }));
await bootstrap(client);
const versions = await applyMigrations(client);
assert(versions.includes("110"), "migration 110 was not applied locally");
await client.query(`SELECT set_config('app.bypass_membership_guards', 'on', false)`);
await client.query(`DELETE FROM public.organizations WHERE name LIKE 'Phase 5B %'`);

await run("legacy default is false", async () => {
  const { rows } = await client.query(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_sms_credit_balances'
      AND column_name = 'auto_replenish_enabled'
  `);
  assert(String(rows[0].column_default).includes("false"), String(rows[0].column_default));
});

await run("new balance row defaults the legacy flag false", async () => {
  const fx = await createOrg(client, { name: "Phase 5B default balance", planKey: "servant_standard" });
  await client.query(
    `INSERT INTO public.organization_sms_credit_balances (organization_id) VALUES ($1)`,
    [fx.organizationId],
  );
  const row = await balanceOf(client, fx.organizationId);
  assert(row.auto_replenish_enabled === false, "default true");
  assert(Number(row.balance) === 0, "balance");
});

await run("forcing the legacy flag false does not change balance", async () => {
  const fx = await createOrg(client, {
    name: "Phase 5B legacy balance",
    planKey: "servant_standard",
    balance: 49,
  });
  await client.query(
    `UPDATE public.organization_sms_credit_balances SET auto_replenish_enabled = true WHERE organization_id = $1`,
    [fx.organizationId],
  );
  await client.query(
    `
    UPDATE public.organization_sms_credit_balances
    SET auto_replenish_enabled = false
    WHERE organization_id = $1 AND auto_replenish_enabled IS DISTINCT FROM false
    `,
    [fx.organizationId],
  );
  const row = await balanceOf(client, fx.organizationId);
  assert(Number(row.balance) === 49 && row.auto_replenish_enabled === false, "balance changed");
});

await run("legacy true flag alone does not claim", async () => {
  const fx = await createOrg(client, {
    name: "Phase 5B legacy true",
    planKey: "servant_standard",
    balance: 9,
  });
  await client.query(
    `UPDATE public.organization_sms_credit_balances SET auto_replenish_enabled = true WHERE organization_id = $1`,
    [fx.organizationId],
  );
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "not_enabled", result.outcome);
});

await run("catalog auto_purchase_allowed is not consent", async () => {
  const { rows } = await client.query(
    `SELECT auto_purchase_allowed FROM public.billing_extra_items WHERE item_key = 'sms_block_50'`,
  );
  assert(rows[0].auto_purchase_allowed === true, "catalog flag");
  const fx = await createOrg(client, {
    name: "Phase 5B catalog flag",
    planKey: "servant_standard",
    balance: 0,
  });
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "not_enabled", result.outcome);
});

await run("no configuration does not claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B no config", planKey: "servant_standard", balance: 0 });
  assert((await claim(client, fx.organizationId)).outcome === "not_enabled", "outcome");
});

await run("disabled configuration does not claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B disabled", planKey: "servant_standard", balance: 0 });
  assert((await enable(client, fx)).outcome === "enabled", "enable");
  const disabled = await rpc(client, "configure_application_sms_auto_replenishment", [
    fx.organizationId, fx.userId, "disable", null, null, null, null,
  ]);
  assert(disabled.outcome === "disabled", disabled.outcome);
  assert((await claim(client, fx.organizationId)).outcome === "not_enabled", "claim");
});

await run("enabled configuration can claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B enabled", planKey: "servant_standard", balance: 9 });
  assert((await enable(client, fx)).ok === true, "enable");
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "claimed", result.outcome);
  assert(result.package_segments === 50 && result.expected_amount_cents === 500, "package");
  assert(result.idempotency_key === `sms:auto:${result.attempt_id}`, "grant key");
  assert(result.provider_idempotency_key === `sms_auto_pi_${result.attempt_id}`, "provider key");
});

await run("missing payment method does not claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B payment", planKey: "servant_standard", balance: 0 });
  await enable(client, fx);
  await client.query(
    `UPDATE public.organization_sms_auto_replenishment SET payment_method_id = NULL WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert((await claim(client, fx.organizationId)).outcome === "payment_method_missing", "outcome");
});

await run("invalid threshold is rejected", async () => {
  const fx = await createOrg(client, { name: "Phase 5B threshold", planKey: "servant_standard", balance: 0 });
  const rejected = await enable(client, fx, { threshold: 50 });
  assert(rejected.outcome === "configuration_invalid", rejected.outcome);
  await enable(client, fx, { threshold: 10 });
  await client.query(
    `UPDATE public.organization_sms_auto_replenishment SET low_balance_threshold_segments = 50 WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert((await claim(client, fx.organizationId)).outcome === "configuration_invalid", "claim");
});

await run("invalid spending cap is rejected", async () => {
  const fx = await createOrg(client, { name: "Phase 5B cap invalid", planKey: "servant_standard" });
  const tooSmall = await enable(client, fx, { cap: 100 });
  assert(tooSmall.outcome === "configuration_invalid", tooSmall.outcome);
  const tooLarge = await enable(client, fx, { cap: 50001 });
  assert(tooLarge.outcome === "configuration_invalid", tooLarge.outcome);
});

await run("higher current price requires reauthorization", async () => {
  const fx = await createOrg(client, { name: "Phase 5B price up", planKey: "servant_standard", balance: 0 });
  await enable(client, fx, { threshold: 10, cap: 5000 });
  const steward = await client.query(`SELECT id FROM public.subscription_plans WHERE plan_key = 'steward_pro'`);
  await client.query(`UPDATE public.organization_subscriptions SET plan_id = $2 WHERE id = $1`, [
    fx.subscriptionId,
    steward.rows[0].id,
  ]);
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "authorization_review_required", result.outcome);
  const { rows } = await client.query(
    `SELECT status FROM public.organization_sms_auto_replenishment WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(rows[0].status === "authorization_review_required", rows[0].status);
  const attempts = await client.query(
    `SELECT count(*)::integer AS n FROM public.organization_sms_replenishment_attempts WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(attempts.rows[0].n === 0, "attempt created");
});

await run("equal package price can claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B price equal", planKey: "servant_standard", balance: 9 });
  await enable(client, fx);
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "claimed" && result.expected_amount_cents === 500, result.outcome);
});

await run("lower current price can claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B price down", planKey: "steward_pro", balance: 9 });
  await enable(client, fx, { threshold: 10, cap: 5000 });
  const servant = await client.query(`SELECT id FROM public.subscription_plans WHERE plan_key = 'servant_standard'`);
  await client.query(`UPDATE public.organization_subscriptions SET plan_id = $2 WHERE id = $1`, [
    fx.subscriptionId,
    servant.rows[0].id,
  ]);
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "claimed", result.outcome);
  assert(result.package_key === "sms_block_50" && result.expected_amount_cents === 500, "current package");
});

const inactive = ["trialing", "past_due", "grace_period", "incomplete", "cancelled", "expired", "suspended"];
for (const status of inactive) {
  await run(`${status} does not claim`, async () => {
    const fx = await createOrg(client, {
      name: `Phase 5B ${status}`,
      planKey: "servant_standard",
      balance: 0,
      status,
    });
    const enabled = await enable(client, fx);
    assert(enabled.outcome === "not_active", enabled.outcome);
    assert((await claim(client, fx.organizationId)).outcome === "not_active", "claim");
  });
}

await run("active subscription can claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B active", planKey: "servant_standard", balance: 0 });
  await enable(client, fx);
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "claim");
});

await run("capacity above threshold does not claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B above", planKey: "steward_pro", balance: 0 });
  await enable(client, fx, { threshold: 20, cap: 5000 });
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "above_threshold", result.outcome);
  assert(result.included_available === 250, String(result.included_available));
});

await run("capacity exactly at threshold claims", async () => {
  const fx = await createOrg(client, { name: "Phase 5B exact", planKey: "servant_standard", balance: 10 });
  await enable(client, fx, { threshold: 10 });
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "claimed" && result.observed_total_available === 10, result.outcome);
});

await run("capacity below threshold claims", async () => {
  const fx = await createOrg(client, { name: "Phase 5B below", planKey: "servant_standard", balance: 9 });
  await enable(client, fx, { threshold: 10 });
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "claimed" && result.purchased_available === 9, result.outcome);
});

await run("included capacity prevents purchased replenishment", async () => {
  const fx = await createOrg(client, {
    name: "Phase 5B included",
    planKey: "steward_pro",
    balance: 0,
    used: 50,
  });
  await enable(client, fx, { threshold: 20, cap: 5000 });
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "above_threshold", result.outcome);
  assert(result.included_available === 200 && result.purchased_available === 0, "split");
});

await run("servant purchased-only low balance claims", async () => {
  const fx = await createOrg(client, { name: "Phase 5B servant low", planKey: "servant_standard", balance: 9 });
  await enable(client, fx, { threshold: 10 });
  const result = await claim(client, fx.organizationId);
  assert(result.included_available === 0 && result.outcome === "claimed", result.outcome);
});

await run("no prior automatic spend can claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B fresh cap", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 10, cap: 500 });
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "claim");
});

await run("spend below the cap allows another package", async () => {
  const fx = await createOrg(client, { name: "Phase 5B cap room", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 40, cap: 1000 });
  const first = await claim(client, fx.organizationId);
  await markPending(client, first.attempt_id);
  assert((await grant(client, first.attempt_id, "pi_phase5b_room", 500, 0)).outcome === "recorded", "grant");
  await client.query(
    `UPDATE public.organization_sms_credit_balances SET balance = 1 WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "second");
});

await run("package that would exceed the cap does not claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B cap full", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 40, cap: 500 });
  const first = await claim(client, fx.organizationId);
  await markPending(client, first.attempt_id);
  await grant(client, first.attempt_id, "pi_phase5b_full", 500, 0);
  await client.query(
    `UPDATE public.organization_sms_credit_balances SET balance = 1 WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert((await claim(client, fx.organizationId)).outcome === "period_cap_reached", "cap");
});

await run("exact cap boundary claims", async () => {
  const fx = await createOrg(client, { name: "Phase 5B cap exact", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 10, cap: 500 });
  const result = await claim(client, fx.organizationId);
  assert(result.outcome === "claimed" && result.expected_amount_cents === 500, result.outcome);
});

await run("manual purchases do not count against the cap", async () => {
  const fx = await createOrg(client, { name: "Phase 5B manual cap", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 10, cap: 500 });
  await client.query(
    `
    INSERT INTO public.billing_transactions (
      organization_id, transaction_type, status, currency, amount_cents, tax_cents,
      billing_provider, idempotency_key, description
    ) VALUES ($1, 'sms_block', 'succeeded', 'USD', 5000, 0, 'stripe', $2, 'Application SMS credit purchase')
    `,
    [fx.organizationId, `sms:purchase:manual-${fx.organizationId}`],
  );
  await client.query(
    `
    INSERT INTO public.organization_sms_credit_ledger (
      organization_id, delta, reason, idempotency_key
    ) VALUES ($1, 50, 'manual_purchase', $2)
    `,
    [fx.organizationId, `sms:purchase:manual-${fx.organizationId}`],
  );
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "claim");
});

await run("prior-period automatic spend does not count", async () => {
  const fx = await createOrg(client, { name: "Phase 5B prior period", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 10, cap: 500 });
  const id = crypto.randomUUID();
  await client.query(
    `
    INSERT INTO public.organization_sms_replenishment_attempts (
      id, organization_id, status, subscription_period_start, subscription_period_end,
      observed_total_available_segments, observed_included_available_segments,
      observed_purchased_available_segments, threshold_segments, plan_key, package_key,
      package_segments, expected_amount_cents, tax_cents, idempotency_key, provider_idempotency_key,
      succeeded_at
    ) VALUES (
      $1, $2, 'succeeded', $3, $4,
      0, 0, 0, 10, 'servant_standard', 'sms_block_50',
      50, 500, 0, $5, $6, now()
    )
    `,
    [id, fx.organizationId, PRIOR_START, PRIOR_END, `sms:auto:${id}`, `sms_auto_pi_${id}`],
  );
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "claim");
});

await run("open attempt blocks a second claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B open", planKey: "servant_standard", balance: 1 });
  await enable(client, fx);
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "first");
  assert((await claim(client, fx.organizationId)).outcome === "open_attempt_exists", "second");
});

await run("failed attempt allows a later claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B failed later", planKey: "servant_standard", balance: 1 });
  await enable(client, fx);
  const first = await claim(client, fx.organizationId);
  await client.query(
    `UPDATE public.organization_sms_replenishment_attempts SET status = 'failed', failed_at = now() WHERE id = $1`,
    [first.attempt_id],
  );
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "later");
});

await run("succeeded attempt allows another when the cap and balance allow it", async () => {
  const fx = await createOrg(client, { name: "Phase 5B again", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 40, cap: 2000 });
  const first = await claim(client, fx.organizationId);
  await markPending(client, first.attempt_id);
  await grant(client, first.attempt_id, "pi_phase5b_again", 500, 0);
  await client.query(
    `UPDATE public.organization_sms_credit_balances SET balance = 1 WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert((await claim(client, fx.organizationId)).outcome === "claimed", "later");
});

await run("automatic grant credits the package and links records", async () => {
  const fx = await createOrg(client, { name: "Phase 5B grant", planKey: "servant_standard", balance: 9 });
  await client.query(
    `
    INSERT INTO public.subscription_usage (
      organization_id, subscription_id, feature_id, period_start, period_end, quantity_used, quantity_reserved
    )
    SELECT $1, $2, id, $3, $4, 0, 0
    FROM public.features WHERE feature_key = 'messaging.sms.monthly_segment_limit'
    `,
    [fx.organizationId, fx.subscriptionId, PERIOD_START, PERIOD_END],
  );
  await enable(client, fx, { threshold: 10 });
  const claimed = await claim(client, fx.organizationId);
  await markPending(client, claimed.attempt_id);
  const beforeUsed = await includedUsed(client, fx.organizationId);
  const granted = await grant(client, claimed.attempt_id, "pi_phase5b_grant", 500, 80);
  assert(granted.outcome === "recorded", granted.outcome);
  assert(granted.credited_segments === 50, "segments");
  assert(granted.tax_cents === 80 && granted.amount_cents === 500, "tax separate");
  const row = await balanceOf(client, fx.organizationId);
  assert(Number(row.balance) === 59 && Number(row.reserved) === 0, "balance");
  assert((await includedUsed(client, fx.organizationId)) === beforeUsed, "included usage");
  const { rows } = await client.query(
    `
    SELECT a.status, a.billing_transaction_id, a.credit_ledger_id, a.tax_cents,
           t.transaction_type, t.description, t.amount_cents, t.tax_cents AS txn_tax,
           l.reason, l.delta, l.related_transaction_id
    FROM public.organization_sms_replenishment_attempts a
    JOIN public.billing_transactions t ON t.id = a.billing_transaction_id
    JOIN public.organization_sms_credit_ledger l ON l.id = a.credit_ledger_id
    WHERE a.id = $1
    `,
    [claimed.attempt_id],
  );
  assert(rows[0].status === "succeeded", "attempt");
  assert(rows[0].transaction_type === "sms_block", "type");
  assert(rows[0].description === "Automatic SMS credit replenishment", "description");
  assert(rows[0].reason === "auto_replenish" && Number(rows[0].delta) === 50, "ledger");
  assert(rows[0].related_transaction_id === rows[0].billing_transaction_id, "link");
  assert(Number(rows[0].txn_tax) === 80 && Number(rows[0].amount_cents) === 500, "stored tax");
});

await run("exact grant replay does not credit again", async () => {
  const fx = await createOrg(client, { name: "Phase 5B replay", planKey: "servant_standard", balance: 1 });
  await enable(client, fx);
  const claimed = await claim(client, fx.organizationId);
  await markPending(client, claimed.attempt_id);
  await grant(client, claimed.attempt_id, "pi_phase5b_replay", 500, 0);
  const again = await grant(client, claimed.attempt_id, "pi_phase5b_replay", 500, 0);
  assert(again.outcome === "duplicate" && again.duplicate === true, again.outcome);
  const row = await balanceOf(client, fx.organizationId);
  assert(Number(row.balance) === 51, "double credit");
  const txns = await client.query(
    `SELECT count(*)::integer AS n FROM public.billing_transactions WHERE organization_id = $1 AND description = 'Automatic SMS credit replenishment'`,
    [fx.organizationId],
  );
  const ledger = await client.query(
    `SELECT count(*)::integer AS n FROM public.organization_sms_credit_ledger WHERE organization_id = $1 AND reason = 'auto_replenish'`,
    [fx.organizationId],
  );
  assert(txns.rows[0].n === 1 && ledger.rows[0].n === 1, "duplicates");
});

await run("conflicting provider payment id does not credit", async () => {
  const fx = await createOrg(client, { name: "Phase 5B payment conflict", planKey: "servant_standard", balance: 1 });
  await enable(client, fx);
  const claimed = await claim(client, fx.organizationId);
  await markPending(client, claimed.attempt_id);
  await grant(client, claimed.attempt_id, "pi_phase5b_one", 500, 0);
  const conflict = await grant(client, claimed.attempt_id, "pi_phase5b_two", 500, 0);
  assert(conflict.outcome === "idempotency_mismatch", conflict.outcome);
  assert(Number((await balanceOf(client, fx.organizationId)).balance) === 51, "balance");
});

await run("conflicting paid amount does not credit", async () => {
  const fx = await createOrg(client, { name: "Phase 5B amount conflict", planKey: "servant_standard", balance: 1 });
  await enable(client, fx);
  const claimed = await claim(client, fx.organizationId);
  await markPending(client, claimed.attempt_id);
  const wrong = await grant(client, claimed.attempt_id, "pi_phase5b_amount", 400, 0);
  assert(wrong.outcome === "idempotency_mismatch", wrong.outcome);
  assert(Number((await balanceOf(client, fx.organizationId)).balance) === 1, "unchanged");
  const recorded = await grant(client, claimed.attempt_id, "pi_phase5b_amount", 500, 0);
  assert(recorded.outcome === "recorded", recorded.outcome);
  const replay = await grant(client, claimed.attempt_id, "pi_phase5b_amount", 700, 0);
  assert(replay.outcome === "idempotency_mismatch", replay.outcome);
  assert(Number((await balanceOf(client, fx.organizationId)).balance) === 51, "once");
});

await run("unknown attempt and invalid state are rejected", async () => {
  const missing = await rpc(client, "record_automatic_application_sms_replenishment", [
    crypto.randomUUID(),
    "pi_phase5b_missing",
    500,
    0,
    {},
  ]);
  assert(missing.outcome === "missing", missing.outcome);
  const fx = await createOrg(client, { name: "Phase 5B invalid state", planKey: "servant_standard", balance: 1 });
  await enable(client, fx);
  const claimed = await claim(client, fx.organizationId);
  const invalid = await grant(client, claimed.attempt_id, "pi_phase5b_early", 500, 0);
  assert(invalid.outcome === "invalid_state", invalid.outcome);
});

await run("zero tax is stored separately", async () => {
  const fx = await createOrg(client, { name: "Phase 5B zero tax", planKey: "servant_standard", balance: 1 });
  await enable(client, fx);
  const claimed = await claim(client, fx.organizationId);
  await markPending(client, claimed.attempt_id);
  const granted = await grant(client, claimed.attempt_id, "pi_phase5b_zero_tax", 500, 0);
  assert(granted.tax_cents === 0 && granted.amount_cents === 500, "tax");
});

await run("granted credits remain normal purchased capacity", async () => {
  const fx = await createOrg(client, { name: "Phase 5B normal credits", planKey: "servant_standard", balance: 0 });
  await enable(client, fx, { threshold: 10 });
  const claimed = await claim(client, fx.organizationId);
  await markPending(client, claimed.attempt_id);
  await grant(client, claimed.attempt_id, "pi_phase5b_normal", 500, 0);
  const reserved = await rpc(client, "reserve_application_sms_segments", [
    fx.organizationId,
    `phase5b-${fx.organizationId}`,
    1,
  ]);
  assert(reserved.outcome === "reserved", reserved.outcome);
  assert(reserved.included_segments === 0 && reserved.purchased_segments === 1, "funding");
  await rpc(client, "release_application_sms_segments", [
    fx.organizationId,
    `phase5b-${fx.organizationId}`,
  ]);
});

await run("administrator cannot configure replenishment", async () => {
  const fx = await createOrg(client, {
    name: "Phase 5B administrator",
    planKey: "servant_standard",
    role: "administrator",
  });
  const result = await enable(client, fx);
  assert(result.outcome === "forbidden", result.outcome);
});

await run("authorization events are append-only", async () => {
  const fx = await createOrg(client, { name: "Phase 5B events", planKey: "servant_standard", balance: 1 });
  await enable(client, fx, { threshold: 10, cap: 1000 });
  await rpc(client, "configure_application_sms_auto_replenishment", [
    fx.organizationId, fx.userId, "threshold_changed", 12, null, null, null,
  ]);
  await rpc(client, "configure_application_sms_auto_replenishment", [
    fx.organizationId, fx.userId, "spending_cap_changed", null, 2000, null, null,
  ]);
  const steward = await client.query(`SELECT id FROM public.subscription_plans WHERE plan_key = 'steward_pro'`);
  await client.query(`UPDATE public.organization_subscriptions SET plan_id = $2 WHERE id = $1`, [
    fx.subscriptionId, steward.rows[0].id,
  ]);
  await rpc(client, "configure_application_sms_auto_replenishment", [
    fx.organizationId, fx.userId, "reauthorize", null, null, PAYMENT_METHOD, TEXT_VERSION,
  ]);
  await rpc(client, "configure_application_sms_auto_replenishment", [
    fx.organizationId, fx.userId, "disable", null, null, null, null,
  ]);
  const { rows } = await client.query(
    `SELECT action FROM public.organization_sms_auto_replenishment_events WHERE organization_id = $1 ORDER BY created_at`,
    [fx.organizationId],
  );
  const actions = rows.map((row) => row.action);
  for (const action of ["enabled", "threshold_changed", "spending_cap_changed", "reauthorized", "disabled"]) {
    assert(actions.includes(action), action);
  }
  let rejected = false;
  try {
    await client.query(
      `UPDATE public.organization_sms_auto_replenishment_events SET action = 'enabled' WHERE organization_id = $1`,
      [fx.organizationId],
    );
  } catch (error) {
    rejected = String(error instanceof Error ? error.message : error).includes("append-only");
  }
  assert(rejected, "event update was allowed");
});

await run("sms entitlement false does not claim", async () => {
  const fx = await createOrg(client, { name: "Phase 5B entitlement", planKey: "servant_standard", balance: 0 });
  await enable(client, fx);
  await client.query(`
    UPDATE public.plan_features pf
    SET boolean_value = false
    FROM public.features f, public.subscription_plans p
    WHERE pf.feature_id = f.id AND pf.plan_id = p.id
      AND p.plan_key = 'servant_standard'
      AND f.feature_key = 'messaging.sms.enabled'
  `);
  try {
    assert((await claim(client, fx.organizationId)).outcome === "sms_not_entitled", "claim");
  } finally {
    await client.query(`
      UPDATE public.plan_features pf
      SET boolean_value = true
      FROM public.features f, public.subscription_plans p
      WHERE pf.feature_id = f.id AND pf.plan_id = p.id
        AND p.plan_key = 'servant_standard'
        AND f.feature_key = 'messaging.sms.enabled'
    `);
  }
});

await run("cross-organization claim and grant stay isolated", async () => {
  const a = await createOrg(client, { name: "Phase 5B org A", planKey: "servant_standard", balance: 1 });
  const b = await createOrg(client, { name: "Phase 5B org B", planKey: "servant_standard", balance: 7 });
  await enable(client, a);
  const claimed = await claim(client, a.organizationId);
  assert((await claim(client, b.organizationId)).outcome === "not_enabled", "b claim");
  await markPending(client, claimed.attempt_id);
  await grant(client, claimed.attempt_id, "pi_phase5b_org_a", 500, 0);
  assert(Number((await balanceOf(client, a.organizationId)).balance) === 51, "a");
  assert(Number((await balanceOf(client, b.organizationId)).balance) === 7, "b");
});

await run("payment method reference stays disabled and does not grant credits", async () => {
  const fx = await createOrg(client, {
    name: "Phase 5B payment setup",
    planKey: "servant_standard",
    balance: 49,
  });
  const saved = await rpc(client, "record_application_sms_replenishment_payment_method", [
    fx.organizationId,
    fx.userId,
    "pm_phase5b_setup",
  ]);
  assert(saved.outcome === "payment_method_changed", saved.outcome);
  assert(saved.status === "disabled", saved.status);
  assert(saved.enabled === false, "enabled");
  const config = await client.query(
    `SELECT status, payment_method_id FROM public.organization_sms_auto_replenishment WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(config.rows[0].status === "disabled", "row status");
  assert(config.rows[0].payment_method_id === "pm_phase5b_setup", "payment method");
  const events = await client.query(
    `SELECT action FROM public.organization_sms_auto_replenishment_events WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(events.rows.length === 1 && events.rows[0].action === "payment_method_changed", "event");
  const attempts = await client.query(
    `SELECT count(*)::integer AS n FROM public.organization_sms_replenishment_attempts WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(attempts.rows[0].n === 0, "attempts");
  const txns = await client.query(
    `SELECT count(*)::integer AS n FROM public.billing_transactions WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(txns.rows[0].n === 0, "transactions");
  const ledger = await client.query(
    `SELECT count(*)::integer AS n FROM public.organization_sms_credit_ledger WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(ledger.rows[0].n === 0, "ledger");
  assert(Number((await balanceOf(client, fx.organizationId)).balance) === 49, "balance");
  const replaced = await rpc(client, "record_application_sms_replenishment_payment_method", [
    fx.organizationId,
    fx.userId,
    "pm_phase5b_replaced",
  ]);
  assert(replaced.status === "disabled", "replace status");
  const admin = await createOrg(client, {
    name: "Phase 5B payment setup admin",
    planKey: "servant_standard",
    role: "administrator",
  });
  const denied = await rpc(client, "record_application_sms_replenishment_payment_method", [
    admin.organizationId,
    admin.userId,
    "pm_phase5b_admin",
  ]);
  assert(denied.outcome === "forbidden", denied.outcome);
});

await run("removing an enabled payment method reference stops charging", async () => {
  const fx = await createOrg(client, {
    name: "Phase 5B payment removal",
    planKey: "servant_standard",
    balance: 9,
  });
  assert((await enable(client, fx)).outcome === "enabled", "enable");
  const removed = await rpc(client, "record_application_sms_replenishment_payment_method", [
    fx.organizationId,
    fx.userId,
    null,
  ]);
  assert(removed.status === "payment_attention_required", removed.status);
  const config = await client.query(
    `SELECT status, payment_method_id FROM public.organization_sms_auto_replenishment WHERE organization_id = $1`,
    [fx.organizationId],
  );
  assert(config.rows[0].payment_method_id === null, "cleared");
  assert(Number((await balanceOf(client, fx.organizationId)).balance) === 9, "balance");
  assert((await claim(client, fx.organizationId)).outcome === "payment_attention_required", "claim");
});

await run("rpc privileges are service role only", async () => {
  const functions = [
    "claim_application_sms_replenishment(uuid)",
    "record_automatic_application_sms_replenishment(uuid, text, integer, integer, jsonb)",
    "record_application_sms_replenishment_payment_method(uuid, uuid, text)",
  ];
  for (const signature of functions) {
    const { rows } = await client.query(
      `
      SELECT
        has_function_privilege('public', $1, 'execute') AS public_exec,
        has_function_privilege('anon', $1, 'execute') AS anon_exec,
        has_function_privilege('authenticated', $1, 'execute') AS auth_exec,
        has_function_privilege('service_role', $1, 'execute') AS service_exec
      `,
      [signature],
    );
    assert(rows[0].public_exec === false, `${signature} public`);
    assert(rows[0].anon_exec === false, `${signature} anon`);
    assert(rows[0].auth_exec === false, `${signature} authenticated`);
    assert(rows[0].service_exec === true, `${signature} service`);
  }
});

await client.query("BEGIN");
const raceOrg = await createOrg(client, { name: "Phase 5B race", planKey: "servant_standard", balance: 1 });
await enable(client, raceOrg, { threshold: 10, cap: 500 });
await client.query("COMMIT");

await run("concurrent claims create one open attempt", async () => {
  const a = await connect();
  const b = await connect();
  try {
    await assertLiveTarget(a);
    await assertLiveTarget(b);
    const [left, right] = await Promise.all([
      claim(a, raceOrg.organizationId),
      claim(b, raceOrg.organizationId),
    ]);
    const outcomes = [left.outcome, right.outcome].sort();
    assert(outcomes[0] === "claimed" && outcomes[1] === "open_attempt_exists", outcomes.join(","));
    const { rows } = await a.query(
      `SELECT count(*)::integer AS n FROM public.organization_sms_replenishment_attempts WHERE organization_id = $1`,
      [raceOrg.organizationId],
    );
    assert(rows[0].n === 1, "attempt count");
  } finally {
    await a.end();
    await b.end();
  }
});

await run("concurrent grants do not double-credit", async () => {
  const { rows } = await client.query(
    `SELECT id FROM public.organization_sms_replenishment_attempts WHERE organization_id = $1`,
    [raceOrg.organizationId],
  );
  await markPending(client, rows[0].id);
  const a = await connect();
  const b = await connect();
  try {
    await assertLiveTarget(a);
    await assertLiveTarget(b);
    const [left, right] = await Promise.all([
      grant(a, rows[0].id, "pi_phase5b_race", 500, 0),
      grant(b, rows[0].id, "pi_phase5b_race", 500, 0),
    ]);
    const outcomes = [left.outcome, right.outcome].sort();
    assert(outcomes.includes("recorded") && outcomes.includes("duplicate"), outcomes.join(","));
    assert(Number((await balanceOf(client, raceOrg.organizationId)).balance) === 51, "balance");
  } finally {
    await a.end();
    await b.end();
  }
});

await client.query("BEGIN");
const capOrg = await createOrg(client, { name: "Phase 5B cap race", planKey: "servant_standard", balance: 1 });
await enable(client, capOrg, { threshold: 10, cap: 500 });
await client.query("COMMIT");

await run("concurrent claims cannot oversubscribe the cap", async () => {
  const a = await connect();
  const b = await connect();
  try {
    await assertLiveTarget(a);
    await assertLiveTarget(b);
    const [left, right] = await Promise.all([
      claim(a, capOrg.organizationId),
      claim(b, capOrg.organizationId),
    ]);
    const claimedCount = [left, right].filter((result) => result.outcome === "claimed").length;
    assert(claimedCount === 1, "two claims");
    const { rows } = await a.query(
      `
      SELECT COALESCE(SUM(expected_amount_cents + tax_cents), 0)::integer AS held
      FROM public.organization_sms_replenishment_attempts
      WHERE organization_id = $1
        AND status IN ('claimed', 'charging', 'payment_pending')
      `,
      [capOrg.organizationId],
    );
    assert(rows[0].held === 500, "held amount");
  } finally {
    await a.end();
    await b.end();
  }
});

await client.query(`DELETE FROM public.organizations WHERE name LIKE 'Phase 5B %'`);
const leftover = await client.query(
  `SELECT count(*)::integer AS n FROM public.organizations WHERE name LIKE 'Phase 5B %'`,
);
const failed = results.filter((result) => !result.pass);
console.log(JSON.stringify({
  target,
  passed: results.length - failed.length,
  total: results.length,
  leftoverOrganizations: leftover.rows[0].n,
  failed,
}, null, 2));
await Promise.race([
  client.end(),
  new Promise((resolve) => setTimeout(resolve, 3000)),
]);
await Promise.race([
  postgres.stop().catch(() => undefined),
  new Promise((resolve) => setTimeout(resolve, 8000)),
]);
if (failed.length > 0 || leftover.rows[0].n !== 0) process.exit(1);
