/**
 * Local-only PostgreSQL integration tests for migration 106 SMS capacity RPCs.
 *
 * This file is not imported by the Next.js application. It refuses to run
 * unless the target is a loopback database named sms_phase4b.
 *
 * Run:
 *   PHASE4B_MODULE_ROOT=<dir with pg and embedded-postgres> npm run selfcheck:sms:postgres
 *
 * Host, port, and database name are fixed. They cannot be pointed at another
 * server. PHASE4B_LOCAL_PASSWORD is optional and is used only for the cluster
 * this process starts on 127.0.0.1.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 55432;
const HOST = "127.0.0.1";
const DATABASE = "sms_phase4b";
const USER = "postgres";
const PASSWORD = (process.env.PHASE4B_LOCAL_PASSWORD ?? "").trim() || "phase4b-local-only";
const FORBIDDEN_PROJECT = "dggvkjafqfvocdpyhdsb";
const RBC_ORGANIZATION_ID = "76f88490-0b60-4df6-8a7f-6a2f405caa50";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const moduleRoot = process.env.PHASE4B_MODULE_ROOT;
if (!moduleRoot) {
  console.error("PHASE4B_MODULE_ROOT is required. Refusing to start.");
  process.exit(1);
}

const require = createRequire(path.join(moduleRoot, "package.json"));
const { Client } = require("pg");
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(require.resolve("embedded-postgres")).href
);

const connectionString = `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}`;

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
    throw new Error("Refusing to run: connection target is not the local Phase 4B database.");
  }
}

function num(value) {
  return Number(value ?? 0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
    SELECT
      inet_server_addr()::text AS addr,
      inet_server_port() AS port,
      current_database() AS db,
      current_setting('data_directory') AS data_directory
  `);
  const row = rows[0];
  const addr = String(row.addr ?? "");
  const localAddr = addr.startsWith("127.0.0.1") || addr.startsWith("::1");
  if (!addr || !localAddr) {
    throw new Error(
      `Refusing to run: inet_server_addr() is not loopback (${addr || "empty"}).`,
    );
  }
  if (Number(row.port) !== PORT) {
    throw new Error(`Refusing to run against port ${row.port}.`);
  }
  if (row.db !== DATABASE && row.db !== "postgres") {
    throw new Error(`Refusing to run against database ${row.db}.`);
  }
  if (String(row.data_directory).toLowerCase().includes(FORBIDDEN_PROJECT)) {
    throw new Error("Refusing to run: data directory matches the production project.");
  }
  const identity = await client.query(`
    SELECT current_setting('cluster_name', true) AS cluster_name
  `);
  const cluster = String(identity.rows[0]?.cluster_name ?? "");
  if (cluster.toLowerCase().includes(FORBIDDEN_PROJECT) || cluster.toLowerCase().includes("supabase.co")) {
    throw new Error("Refusing to run: cluster identity matches a remote project.");
  }
  return row;
}

async function assertLiveTarget(client) {
  const row = await assertLoopbackServer(client);
  if (row.db !== DATABASE) {
    throw new Error(`Refusing to run against database ${row.db}.`);
  }
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
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$ SELECT NULL::uuid $$;
    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS text
    LANGUAGE sql
    STABLE
    AS $$ SELECT 'service_role'::text $$;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text,
      owner uuid,
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[],
      avif_autodetection boolean DEFAULT false,
      owner_id text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit bigint;
    ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types text[];
    ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS owner uuid;
    ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS avif_autodetection boolean DEFAULT false;
    ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS owner_id text;
    ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text,
      name text,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz,
      metadata jsonb,
      version text,
      owner_id text,
      user_metadata jsonb
    );
    ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz;
    ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS metadata jsonb;
    ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS version text;
    ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner_id text;
    ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS user_metadata jsonb;
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

function migrationFiles(names) {
  return names
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .map((name) => ({
      name,
      version: name.slice(0, name.indexOf("_")),
    }))
    .sort((a, b) => Number(a.version) - Number(b.version) || a.name.localeCompare(b.name));
}

async function applyMigrations(client) {
  const names = await fs.readdir(migrationsDir);
  const files = migrationFiles(names);
  const applied = new Set(
    (
      await client.query(`SELECT version FROM supabase_migrations.schema_migrations`)
    ).rows.map((row) => row.version),
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
  const { rows } = await client.query(
    `SELECT public.${fn}(${placeholders}) AS result`,
    args,
  );
  return rows[0].result;
}

async function setMonthlyLimit(client, planKey, limit) {
  const { rowCount } = await client.query(
    `
    UPDATE public.plan_features pf
    SET integer_value = $2, updated_at = now()
    FROM public.subscription_plans p
    JOIN public.features f ON f.feature_key = 'messaging.sms.monthly_segment_limit'
    WHERE pf.plan_id = p.id
      AND pf.feature_id = f.id
      AND p.plan_key = $1
    `,
    [planKey, limit],
  );
  assert(rowCount === 1, `monthly limit update for ${planKey} changed ${rowCount} rows`);
}

async function createFixture(client, spec) {
  const slug = `phase4b-${crypto.randomUUID()}`;
  const org = await client.query(
    `
    INSERT INTO public.organizations (name, slug, status)
    VALUES ($1, $2, 'active')
    RETURNING id
    `,
    [spec.name, slug],
  );
  const organizationId = org.rows[0].id;
  assert(
    organizationId !== RBC_ORGANIZATION_ID,
    "fixture collided with the production RBC organization id",
  );
  const plan = await client.query(
    `SELECT id FROM public.subscription_plans WHERE plan_key = $1`,
    [spec.planKey],
  );
  assert(plan.rows[0]?.id, `missing plan ${spec.planKey}`);
  if (spec.monthlyLimit != null) {
    await setMonthlyLimit(client, spec.planKey, spec.monthlyLimit);
  }
  const subscription = await client.query(
    `
    INSERT INTO public.organization_subscriptions (
      organization_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      started_at
    )
    VALUES ($1, $2, $3, $4, $5, $4)
    RETURNING id
    `,
    [
      organizationId,
      plan.rows[0].id,
      spec.status ?? "active",
      spec.periodStart,
      spec.periodEnd,
    ],
  );
  if (spec.used || spec.includedReserved) {
    const feature = await client.query(
      `SELECT id FROM public.features WHERE feature_key = 'messaging.sms.monthly_segment_limit'`,
    );
    await client.query(
      `
      INSERT INTO public.subscription_usage (
        organization_id,
        subscription_id,
        feature_id,
        period_start,
        period_end,
        quantity_used,
        quantity_reserved
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        organizationId,
        subscription.rows[0].id,
        feature.rows[0].id,
        spec.periodStart,
        spec.periodEnd,
        spec.used ?? 0,
        spec.includedReserved ?? 0,
      ],
    );
  }
  if (spec.balance != null) {
    await client.query(
      `
      INSERT INTO public.organization_sms_credit_balances (
        organization_id,
        balance,
        reserved,
        auto_replenish_enabled,
        low_balance_threshold
      )
      VALUES ($1, $2, $3, false, 0)
      `,
      [organizationId, spec.balance, spec.purchasedReserved ?? 0],
    );
  }
  return {
    organizationId,
    subscriptionId: subscription.rows[0].id,
    planId: plan.rows[0].id,
  };
}

async function usage(client, organizationId, periodStart) {
  const { rows } = await client.query(
    `
    SELECT quantity_used, quantity_reserved
    FROM public.subscription_usage
    WHERE organization_id = $1
      AND ($2::timestamptz IS NULL OR period_start = $2::timestamptz)
    ORDER BY period_start
    `,
    [organizationId, periodStart ?? null],
  );
  return rows.map((row) => ({
    used: num(row.quantity_used),
    reserved: num(row.quantity_reserved),
  }));
}

async function wallet(client, organizationId) {
  const { rows } = await client.query(
    `
    SELECT balance, reserved
    FROM public.organization_sms_credit_balances
    WHERE organization_id = $1
    `,
    [organizationId],
  );
  if (!rows[0]) return null;
  return {
    balance: num(rows[0].balance),
    reserved: num(rows[0].reserved),
    available: num(rows[0].balance) - num(rows[0].reserved),
  };
}

async function allocation(client, organizationId, deliveryId) {
  const { rows } = await client.query(
    `
    SELECT
      requested_segments,
      included_segments,
      purchased_segments,
      generation,
      state,
      send_started_at
    FROM public.organization_sms_segment_allocations
    WHERE organization_id = $1 AND delivery_id = $2
    `,
    [organizationId, deliveryId],
  );
  return rows[0] ?? null;
}

async function ledger(client, organizationId) {
  const { rows } = await client.query(
    `
    SELECT reason::text AS reason, delta, idempotency_key
    FROM public.organization_sms_credit_ledger
    WHERE organization_id = $1
    ORDER BY created_at, reason
    `,
    [organizationId],
  );
  return rows.map((row) => ({
    reason: row.reason,
    delta: num(row.delta),
    key: row.idempotency_key,
  }));
}

async function withTxn(client, spec, fn) {
  await client.query("BEGIN");
  try {
    const fixture = await createFixture(client, spec);
    const value = await fn(fixture);
    await client.query("ROLLBACK");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

const PERIOD_START = "2026-03-01T00:00:00Z";
const PERIOD_END = "2026-04-01T00:00:00Z";

function baseSpec(overrides) {
  return {
    name: `Phase 4B SMS Test ${overrides.label}`,
    planKey: "steward_pro",
    status: "active",
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    monthlyLimit: 10,
    used: 0,
    includedReserved: 0,
    balance: 0,
    purchasedReserved: 0,
    ...overrides,
  };
}

const results = [];

async function run(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail: detail ?? null });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, pass: false, detail: message });
    console.error(`FAIL ${name}: ${message}`);
  }
}

assertNoRemoteEnvironment();
assertConnectionStringIsLocal(connectionString, DATABASE);

const moduleRootResolved = path.resolve(moduleRoot);
if (
  moduleRootResolved.toLowerCase().startsWith(repoRoot.toLowerCase()) ||
  moduleRootResolved.toLowerCase().includes(FORBIDDEN_PROJECT)
) {
  throw new Error("Refusing to load database modules from the application or production project.");
}

const databaseDir = path.join(moduleRootResolved, "data");
const postgres = new EmbeddedPostgres({
  databaseDir,
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

const versionFile = path.join(databaseDir, "PG_VERSION");
let initialized = false;
try {
  await fs.access(versionFile);
  initialized = true;
} catch {
  initialized = false;
}
if (!initialized) await postgres.initialise();
process.on("uncaughtException", (error) => {
  console.error(error);
  postgres.stop().finally(() => process.exit(1));
});
await postgres.start();

const admin = await connect("postgres");
await assertLoopbackServer(admin);
const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DATABASE]);
if (exists.rowCount === 0) {
  await admin.query(`CREATE DATABASE ${DATABASE}`);
}
await admin.end();

const client = await connect();
const target = await assertLiveTarget(client);
console.log(
  JSON.stringify({
    host: target.addr || HOST,
    port: Number(target.port),
    database: target.db,
  }),
);

await bootstrap(client);
const versions = await applyMigrations(client);
const latest = versions.at(-1);
assert(versions.includes("109"), `expected migration 109 to be applied, last file was ${latest}`);
for (const version of ["106", "107", "108", "109"]) {
  const found = await client.query(
    `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [version],
  );
  assert(found.rowCount === 1, `migration ${version} is not applied locally`);
}
const replenishment = await client.query(
  `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '110'`,
);
assert(replenishment.rowCount === 1, "migration 110 is not applied locally");

const rbc = await client.query(
  `SELECT count(*)::int AS n FROM public.organizations WHERE id = $1`,
  [RBC_ORGANIZATION_ID],
);
assert(rbc.rows[0].n === 0, "production RBC organization is present in the local database");

const servant = await client.query(`
  SELECT f.feature_key, pf.boolean_value, pf.integer_value
  FROM public.plan_features pf
  JOIN public.subscription_plans p ON p.id = pf.plan_id
  JOIN public.features f ON f.id = pf.feature_id
  WHERE p.plan_key = 'servant_standard'
    AND f.feature_key IN ('messaging.sms.enabled', 'messaging.sms.monthly_segment_limit')
`);
const enabled = servant.rows.find((row) => row.feature_key === "messaging.sms.enabled");
const limit = servant.rows.find(
  (row) => row.feature_key === "messaging.sms.monthly_segment_limit",
);
assert(enabled?.boolean_value === true, "local Servant SMS entitlement is not true");
assert(num(limit?.integer_value) === 0, "local Servant monthly limit is not 0");

const lockDef = await client.query(
  `SELECT pg_get_functiondef('public.application_sms_capacity_lock(uuid)'::regprocedure) AS def`,
);
assert(
  lockDef.rows[0].def.includes("pg_advisory_xact_lock"),
  "capacity lock does not use pg_advisory_xact_lock",
);

await run("included-only", () =>
  withTxn(
    client,
    baseSpec({ label: "included-only", monthlyLimit: 10, balance: 0 }),
    async (fx) => {
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-included-only",
        1,
      ]);
      assert(reserved.ok === true && reserved.outcome === "reserved", "reserve failed");
      assert(reserved.included_segments === 1 && reserved.purchased_segments === 0, "split");
      const during = (await usage(client, fx.organizationId, PERIOD_START))[0];
      assert(during.used === 0 && during.reserved === 1, "reservation usage");
      const duringWallet = await wallet(client, fx.organizationId);
      assert(duringWallet.balance === 0 && duringWallet.reserved === 0, "wallet untouched");
      const committed = await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-included-only",
      ]);
      assert(committed.ok === true && committed.outcome === "committed", "commit failed");
      const after = (await usage(client, fx.organizationId, PERIOD_START))[0];
      assert(after.used === 1 && after.reserved === 0, "committed usage");
      const row = await allocation(client, fx.organizationId, "phase4b-included-only");
      assert(row.state === "committed", "allocation state");
      assert((await ledger(client, fx.organizationId)).length === 0, "purchased ledger");
    },
  ),
);

await run("included-first", () =>
  withTxn(
    client,
    baseSpec({
      label: "included-first",
      monthlyLimit: 10,
      used: 5,
      balance: 10,
    }),
    async (fx) => {
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-included-first",
        3,
      ]);
      assert(reserved.included_segments === 3 && reserved.purchased_segments === 0, "split");
      const committed = await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-included-first",
      ]);
      assert(committed.outcome === "committed", "commit");
      const after = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const afterWallet = await wallet(client, fx.organizationId);
      assert(after.used === 8 && after.reserved === 0, "included usage");
      assert(afterWallet.balance === 10 && afterWallet.reserved === 0, "purchased wallet");
    },
  ),
);

let boundaryLedger = null;
await run("boundary-split", () =>
  withTxn(
    client,
    baseSpec({ label: "boundary", monthlyLimit: 10, used: 9, balance: 10 }),
    async (fx) => {
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-boundary",
        2,
      ]);
      assert(reserved.included_segments === 1 && reserved.purchased_segments === 1, "split");
      const during = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const duringWallet = await wallet(client, fx.organizationId);
      assert(during.used === 9 && during.reserved === 1, "included hold");
      assert(duringWallet.balance === 10 && duringWallet.reserved === 1, "purchased hold");
      await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-boundary",
      ]);
      const after = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const afterWallet = await wallet(client, fx.organizationId);
      const rows = await ledger(client, fx.organizationId);
      const consumes = rows.filter((row) => row.reason === "consume");
      assert(after.used === 10 && after.reserved === 0, "included commit");
      assert(afterWallet.balance === 9 && afterWallet.reserved === 0, "purchased commit");
      assert(consumes.length === 1 && consumes[0].delta === -1, "consume ledger");
      assert((await allocation(client, fx.organizationId, "phase4b-boundary")).state === "committed");
      boundaryLedger = rows;
    },
  ),
);

let purchasedLedger = null;
let purchasedDuring = null;
let purchasedAfter = null;
await run("purchased-only-servant", () =>
  withTxn(
    client,
    baseSpec({
      label: "servant",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 50,
    }),
    async (fx) => {
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-servant",
        1,
      ]);
      assert(reserved.included_segments === 0 && reserved.purchased_segments === 1, "split");
      purchasedDuring = await wallet(client, fx.organizationId);
      assert(
        purchasedDuring.balance === 50 &&
          purchasedDuring.reserved === 1 &&
          purchasedDuring.available === 49,
        "reservation wallet",
      );
      const committed = await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-servant",
      ]);
      assert(committed.outcome === "committed" && committed.duplicate === false, "commit");
      purchasedAfter = await wallet(client, fx.organizationId);
      const usageRows = await usage(client, fx.organizationId, PERIOD_START);
      assert(usageRows.length === 0, "included usage created");
      assert(
        purchasedAfter.balance === 49 &&
          purchasedAfter.reserved === 0 &&
          purchasedAfter.available === 49,
        "committed wallet",
      );
      purchasedLedger = await ledger(client, fx.organizationId);
      const consumes = purchasedLedger.filter((row) => row.reason === "consume");
      assert(consumes.length === 1 && consumes[0].delta === -1, "consume");
      assert((await allocation(client, fx.organizationId, "phase4b-servant")).state === "committed");
    },
  ),
);

await run("insufficient", () =>
  withTxn(
    client,
    baseSpec({ label: "insufficient", monthlyLimit: 10, used: 9, balance: 1 }),
    async (fx) => {
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-insufficient",
        3,
      ]);
      assert(reserved.ok === false && reserved.outcome === "insufficient", "outcome");
      assert((await allocation(client, fx.organizationId, "phase4b-insufficient")) == null, "allocation");
      const after = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const afterWallet = await wallet(client, fx.organizationId);
      assert(after.used === 9 && after.reserved === 0, "usage");
      assert(afterWallet.balance === 1 && afterWallet.reserved === 0, "wallet");
      assert((await ledger(client, fx.organizationId)).length === 0, "ledger");
    },
  ),
);

let releaseLedger = null;
await run("reserve-release", () =>
  withTxn(
    client,
    baseSpec({ label: "release", monthlyLimit: 10, used: 9, balance: 10 }),
    async (fx) => {
      const beforeUsed = 9;
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-release",
        2,
      ]);
      assert(reserved.included_segments === 1 && reserved.purchased_segments === 1, "split");
      const released = await rpc(client, "release_application_sms_segments", [
        fx.organizationId,
        "phase4b-release",
      ]);
      assert(released.outcome === "released" && released.duplicate === false, "release");
      const after = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const afterWallet = await wallet(client, fx.organizationId);
      releaseLedger = await ledger(client, fx.organizationId);
      assert(after.used === beforeUsed && after.reserved === 0, "included");
      assert(afterWallet.balance === 10 && afterWallet.reserved === 0, "purchased");
      assert((await allocation(client, fx.organizationId, "phase4b-release")).state === "released");
      assert(
        releaseLedger.some((row) => row.reason === "reserve" && row.delta === 0),
        "reserve ledger",
      );
      assert(
        releaseLedger.some((row) => row.reason === "release_reserve" && row.delta === 0),
        "release ledger",
      );
      assert(!releaseLedger.some((row) => row.reason === "consume"), "consume ledger");
    },
  ),
);

await run("send-started-commit", () =>
  withTxn(
    client,
    baseSpec({
      label: "started",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 5,
    }),
    async (fx) => {
      await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-started",
        1,
      ]);
      const started = await rpc(client, "mark_application_sms_send_started", [
        fx.organizationId,
        "phase4b-started",
      ]);
      assert(started.send_allowed === true && started.outcome === "reserved", "started");
      const held = await allocation(client, fx.organizationId, "phase4b-started");
      assert(held.state === "reserved" && held.send_started_at, "still reserved");
      const committed = await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-started",
      ]);
      assert(committed.outcome === "committed" && committed.duplicate === false, "commit");
      const consumes = (await ledger(client, fx.organizationId)).filter(
        (row) => row.reason === "consume",
      );
      assert(consumes.length === 1 && consumes[0].delta === -1, "one consume");
      assert((await wallet(client, fx.organizationId)).balance === 4, "balance");
    },
  ),
);

await run("duplicate-commit", () =>
  withTxn(
    client,
    baseSpec({
      label: "dup-commit",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 5,
    }),
    async (fx) => {
      await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-commit",
        1,
      ]);
      await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-commit",
      ]);
      const again = await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-commit",
      ]);
      assert(again.ok === true && again.outcome === "committed" && again.duplicate === true, "duplicate");
      const rows = await ledger(client, fx.organizationId);
      assert(rows.filter((row) => row.reason === "consume").length === 1, "one consume");
      assert((await wallet(client, fx.organizationId)).balance === 4, "balance once");
    },
  ),
);

await run("duplicate-release", () =>
  withTxn(
    client,
    baseSpec({
      label: "dup-release",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 5,
    }),
    async (fx) => {
      await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-release",
        1,
      ]);
      await rpc(client, "release_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-release",
      ]);
      const before = await wallet(client, fx.organizationId);
      const again = await rpc(client, "release_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-release",
      ]);
      const after = await wallet(client, fx.organizationId);
      assert(again.ok === true && again.outcome === "released" && again.duplicate === true, "duplicate");
      assert(before.balance === 5 && before.reserved === 0, "before");
      assert(after.balance === before.balance && after.reserved === before.reserved, "unchanged");
    },
  ),
);

await run("release-after-commit", () =>
  withTxn(
    client,
    baseSpec({ label: "no-refund", monthlyLimit: 10, used: 1, balance: 5 }),
    async (fx) => {
      await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-no-refund",
        2,
      ]);
      await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-no-refund",
      ]);
      const beforeUsage = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const beforeWallet = await wallet(client, fx.organizationId);
      const released = await rpc(client, "release_application_sms_segments", [
        fx.organizationId,
        "phase4b-no-refund",
      ]);
      const afterUsage = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const afterWallet = await wallet(client, fx.organizationId);
      assert(released.outcome === "committed" && released.duplicate === true, "stays committed");
      assert(afterUsage.used === beforeUsage.used, "included not refunded");
      assert(afterWallet.balance === beforeWallet.balance, "purchased not refunded");
      assert((await allocation(client, fx.organizationId, "phase4b-no-refund")).state === "committed");
    },
  ),
);

await run("duplicate-reserve", () =>
  withTxn(
    client,
    baseSpec({ label: "dup-reserve", monthlyLimit: 10, used: 9, balance: 10 }),
    async (fx) => {
      const first = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-reserve",
        2,
      ]);
      const second = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-dup-reserve",
        2,
      ]);
      const row = await allocation(client, fx.organizationId, "phase4b-dup-reserve");
      const held = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const heldWallet = await wallet(client, fx.organizationId);
      assert(first.included_segments === 1 && first.purchased_segments === 1, "initial split");
      assert(second.duplicate === true && second.outcome === "reserved", "duplicate");
      assert(
        second.included_segments === first.included_segments &&
          second.purchased_segments === first.purchased_segments,
        "same split",
      );
      assert(held.used === 9 && held.reserved === 1, "included hold once");
      assert(heldWallet.balance === 10 && heldWallet.reserved === 1, "purchased hold once");
      assert(num(row.generation) === 1, "generation");
    },
  ),
);

let generationDetail = null;
await run("reserve-after-release", () =>
  withTxn(
    client,
    baseSpec({
      label: "generation",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 5,
    }),
    async (fx) => {
      await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-generation",
        1,
      ]);
      await rpc(client, "release_application_sms_segments", [
        fx.organizationId,
        "phase4b-generation",
      ]);
      const again = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-generation",
        1,
      ]);
      const row = await allocation(client, fx.organizationId, "phase4b-generation");
      const rows = await ledger(client, fx.organizationId);
      generationDetail = { generation: num(row.generation), keys: rows.map((item) => item.key) };
      assert(again.outcome === "reserved" && again.duplicate === false, "new reserve");
      assert(again.purchased_segments === 1 && again.included_segments === 0, "split");
      assert(num(row.generation) === 2 && row.state === "reserved", "generation");
      assert(rows.filter((item) => item.reason === "reserve").length === 2, "two reserve keys");
      assert(
        rows.some((item) => item.key.endsWith(":g:1")) &&
          rows.some((item) => item.key.endsWith(":g:2")),
        "generation keys",
      );
      assert((await wallet(client, fx.organizationId)).reserved === 1, "one hold");
    },
  ),
);

let stranded = null;
await run("send-started-stranded", () =>
  withTxn(
    client,
    baseSpec({
      label: "stranded",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 5,
    }),
    async (fx) => {
      await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-stranded",
        1,
      ]);
      await rpc(client, "mark_application_sms_send_started", [
        fx.organizationId,
        "phase4b-stranded",
      ]);
      stranded = await rpc(client, "mark_application_sms_send_started", [
        fx.organizationId,
        "phase4b-stranded",
      ]);
      const row = await allocation(client, fx.organizationId, "phase4b-stranded");
      assert(stranded.ok === false && stranded.outcome === "stranded", "outcome");
      assert(stranded.send_allowed === false, "send not allowed");
      assert(row.state === "reserved" && row.send_started_at, "not released");
      assert((await wallet(client, fx.organizationId)).balance === 5, "not consumed");
    },
  ),
);

const eligibility = {};
await run("eligible-statuses", () =>
  withTxn(client, baseSpec({ label: "eligible", monthlyLimit: 10, balance: 0 }), async (fx) => {
    for (const status of ["trialing", "active", "past_due", "grace_period"]) {
      await client.query(
        `UPDATE public.organization_subscriptions SET status = $2 WHERE id = $1`,
        [fx.subscriptionId, status],
      );
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        `phase4b-${status}`,
        1,
      ]);
      eligibility[status] = reserved.outcome;
      assert(reserved.ok === true && reserved.outcome === "reserved", status);
    }
  }),
);

const ineligible = {};
await run("ineligible-statuses", () =>
  withTxn(
    client,
    baseSpec({
      label: "ineligible",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 10,
    }),
    async (fx) => {
      for (const status of ["cancelled", "incomplete"]) {
        await client.query(
          `UPDATE public.organization_subscriptions SET status = $2 WHERE id = $1`,
          [fx.subscriptionId, status],
        );
        const reserved = await rpc(client, "reserve_application_sms_segments", [
          fx.organizationId,
          `phase4b-${status}`,
          1,
        ]);
        ineligible[status] = reserved.outcome;
        const after = await wallet(client, fx.organizationId);
        assert(reserved.ok === false && reserved.outcome === "ineligible", status);
        assert(after.balance === 10 && after.reserved === 0, `${status} wallet`);
        assert((await allocation(client, fx.organizationId, `phase4b-${status}`)) == null, status);
      }
    },
  ),
);

await run("period-rollover", () =>
  withTxn(
    client,
    baseSpec({
      label: "rollover",
      monthlyLimit: 10,
      used: 4,
      balance: 10,
    }),
    async (fx) => {
      const nextStart = "2026-04-01T00:00:00Z";
      const nextEnd = "2026-05-01T00:00:00Z";
      await client.query(
        `
        UPDATE public.organization_subscriptions
        SET current_period_start = $2, current_period_end = $3
        WHERE id = $1
        `,
        [fx.subscriptionId, nextStart, nextEnd],
      );
      const beforeLedger = await ledger(client, fx.organizationId);
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-rollover",
        1,
      ]);
      const oldUsage = (await usage(client, fx.organizationId, PERIOD_START))[0];
      const newUsage = (await usage(client, fx.organizationId, nextStart))[0];
      const afterWallet = await wallet(client, fx.organizationId);
      assert(reserved.included_segments === 1 && reserved.purchased_segments === 0, "new period included");
      assert(oldUsage.used === 4 && oldUsage.reserved === 0, "old period");
      assert(newUsage.used === 0 && newUsage.reserved === 1, "new period");
      assert(afterWallet.balance === 10 && afterWallet.reserved === 0, "purchased carryover");
      assert((await ledger(client, fx.organizationId)).length === beforeLedger.length, "no ledger mutation");
    },
  ),
);

await run("plan-change", () =>
  withTxn(
    client,
    baseSpec({ label: "plan-change", planKey: "steward_pro", monthlyLimit: null, balance: 10 }),
    async (fx) => {
      const servantPlan = await client.query(
        `SELECT id FROM public.subscription_plans WHERE plan_key = 'servant_standard'`,
      );
      const before = await ledger(client, fx.organizationId);
      await client.query(
        `UPDATE public.organization_subscriptions SET plan_id = $2 WHERE id = $1`,
        [fx.subscriptionId, servantPlan.rows[0].id],
      );
      assert((await ledger(client, fx.organizationId)).length === before.length, "plan change ledger");
      assert((await wallet(client, fx.organizationId)).balance === 10, "balance after downgrade");
      const servantReserve = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-plan-servant",
        1,
      ]);
      assert(
        servantReserve.included_segments === 0 && servantReserve.purchased_segments === 1,
        "servant funding",
      );
      await rpc(client, "release_application_sms_segments", [
        fx.organizationId,
        "phase4b-plan-servant",
      ]);
      await client.query(
        `UPDATE public.organization_subscriptions SET plan_id = $2 WHERE id = $1`,
        [fx.subscriptionId, fx.planId],
      );
      const stewardReserve = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-plan-steward",
        1,
      ]);
      assert(
        stewardReserve.included_segments === 1 && stewardReserve.purchased_segments === 0,
        "steward funding",
      );
      assert((await wallet(client, fx.organizationId)).balance === 10, "balance after upgrade reserve");
    },
  ),
);

await run("cancellation-reactivation", () =>
  withTxn(
    client,
    baseSpec({
      label: "reactivate",
      planKey: "servant_standard",
      monthlyLimit: null,
      balance: 10,
    }),
    async (fx) => {
      await client.query(
        `UPDATE public.organization_subscriptions SET status = 'cancelled' WHERE id = $1`,
        [fx.subscriptionId],
      );
      const blocked = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-cancelled",
        1,
      ]);
      assert(blocked.outcome === "ineligible", "cancelled");
      assert((await wallet(client, fx.organizationId)).balance === 10, "wallet while cancelled");
      await client.query(
        `UPDATE public.organization_subscriptions SET status = 'active' WHERE id = $1`,
        [fx.subscriptionId],
      );
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-reactivated",
        1,
      ]);
      const after = await wallet(client, fx.organizationId);
      assert(reserved.included_segments === 0 && reserved.purchased_segments === 1, "purchased");
      assert(after.balance === 10 && after.reserved === 1 && after.available === 9, "same wallet");
    },
  ),
);

await run("multi-segment", () =>
  withTxn(
    client,
    baseSpec({ label: "multi", monthlyLimit: 10, used: 9, balance: 10 }),
    async (fx) => {
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        "phase4b-multi",
        3,
      ]);
      assert(reserved.included_segments === 1 && reserved.purchased_segments === 2, "split");
      await rpc(client, "commit_application_sms_segments", [
        fx.organizationId,
        "phase4b-multi",
      ]);
      const after = await wallet(client, fx.organizationId);
      const consumes = (await ledger(client, fx.organizationId)).filter(
        (row) => row.reason === "consume",
      );
      assert(after.balance === 8 && after.reserved === 0, "decrement 2");
      assert(consumes.length === 1 && consumes[0].delta === -2, "one consume");
    },
  ),
);

const bounds = {};
await run("request-bounds", () =>
  withTxn(client, baseSpec({ label: "bounds", monthlyLimit: 10, balance: 10 }), async (fx) => {
    for (const segments of [0, -1, 101]) {
      const reserved = await rpc(client, "reserve_application_sms_segments", [
        fx.organizationId,
        `phase4b-bound-${segments}`,
        segments,
      ]);
      bounds[String(segments)] = reserved.outcome;
      assert(reserved.ok === false && reserved.outcome === "conflict", String(segments));
      assert(
        (await allocation(client, fx.organizationId, `phase4b-bound-${segments}`)) == null,
        String(segments),
      );
    }
  }),
);

await run("cross-organization", () =>
  withTxn(client, baseSpec({ label: "org-a", monthlyLimit: 10, balance: 4 }), async (orgA) => {
    const orgB = await createFixture(
      client,
      baseSpec({ label: "org-b", monthlyLimit: 10, used: 2, balance: 7 }),
    );
    const beforeBUsage = await usage(client, orgB.organizationId, PERIOD_START);
    const beforeBWallet = await wallet(client, orgB.organizationId);
    const beforeBLedger = await ledger(client, orgB.organizationId);
    await rpc(client, "reserve_application_sms_segments", [
      orgA.organizationId,
      "phase4b-shared-delivery",
      1,
    ]);
    const afterBUsage = await usage(client, orgB.organizationId, PERIOD_START);
    const afterBWallet = await wallet(client, orgB.organizationId);
    const afterBLedger = await ledger(client, orgB.organizationId);
    const bAlloc = await client.query(
      `SELECT count(*)::int AS n FROM public.organization_sms_segment_allocations WHERE organization_id = $1`,
      [orgB.organizationId],
    );
    assert(JSON.stringify(afterBUsage) === JSON.stringify(beforeBUsage), "usage");
    assert(afterBWallet.balance === beforeBWallet.balance, "balance");
    assert(afterBWallet.reserved === beforeBWallet.reserved, "reserved");
    assert(afterBLedger.length === beforeBLedger.length, "ledger");
    assert(bAlloc.rows[0].n === 0, "allocation");
  }),
);

let race = null;
await run("concurrency-purchased", async () => {
  await client.query("BEGIN");
  let fx;
  try {
    fx = await createFixture(
      client,
      baseSpec({
        label: "race",
        planKey: "servant_standard",
        monthlyLimit: null,
        balance: 1,
      }),
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const a = await connect();
  const b = await connect();
  try {
    await assertLiveTarget(a);
    await assertLiveTarget(b);
    const lockStarted = Date.now();
    await a.query("BEGIN");
    await a.query(`SELECT public.application_sms_capacity_lock($1)`, [fx.organizationId]);
    const blocked = b.query(
      `SELECT public.reserve_application_sms_segments($1, $2, 1) AS result`,
      [fx.organizationId, "phase4b-lock-probe"],
    );
    await a.query(`SELECT pg_sleep(1.2)`);
    await a.query("ROLLBACK");
    const probe = await blocked;
    assert(probe.rows[0].result.outcome === "reserved", "lock probe did not reserve");
    const waitedMs = Date.now() - lockStarted;
    assert(waitedMs >= 1000, `lock did not block the second session (${waitedMs}ms)`);
    await rpc(a, "release_application_sms_segments", [
      fx.organizationId,
      "phase4b-lock-probe",
    ]);
    const before = await wallet(a, fx.organizationId);
    assert(before.balance === 1 && before.reserved === 0, "reset before race");
    const [left, right] = await Promise.all([
      a.query(`SELECT public.reserve_application_sms_segments($1, $2, 1) AS result`, [
        fx.organizationId,
        "phase4b-race-a",
      ]),
      b.query(`SELECT public.reserve_application_sms_segments($1, $2, 1) AS result`, [
        fx.organizationId,
        "phase4b-race-b",
      ]),
    ]);
    const outcomes = [left.rows[0].result, right.rows[0].result];
    const after = await wallet(a, fx.organizationId);
    const count = await a.query(
      `
      SELECT count(*)::int AS n
      FROM public.organization_sms_segment_allocations
      WHERE organization_id = $1 AND state = 'reserved'
      `,
      [fx.organizationId],
    );
    race = {
      before,
      outcomes: outcomes.map((item) => item.outcome),
      success: outcomes.filter((item) => item.ok === true && item.outcome === "reserved").length,
      lost: outcomes.filter((item) => item.outcome === "insufficient").length,
      after,
      reservedAllocations: count.rows[0].n,
      waitedMs,
    };
    assert(race.success === 1 && race.lost === 1, JSON.stringify(race));
    assert(after.balance === 1 && after.reserved === 1 && after.available === 0, "wallet");
    assert(count.rows[0].n === 1, "one allocation");
  } finally {
    await a.query(
      `DELETE FROM public.organizations WHERE id = $1`,
      [fx.organizationId],
    );
    await a.end();
    await b.end();
  }
});

let boundaryRace = null;
await run("concurrency-boundary", async () => {
  await client.query("BEGIN");
  let fx;
  try {
    fx = await createFixture(
      client,
      baseSpec({
        label: "boundary-race",
        monthlyLimit: 10,
        used: 9,
        balance: 1,
      }),
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const a = await connect();
  const b = await connect();
  try {
    const [left, right] = await Promise.all([
      a.query(`SELECT public.reserve_application_sms_segments($1, $2, 2) AS result`, [
        fx.organizationId,
        "phase4b-boundary-race-a",
      ]),
      b.query(`SELECT public.reserve_application_sms_segments($1, $2, 2) AS result`, [
        fx.organizationId,
        "phase4b-boundary-race-b",
      ]),
    ]);
    const outcomes = [left.rows[0].result, right.rows[0].result];
    const afterUsage = (await usage(a, fx.organizationId, PERIOD_START))[0];
    const afterWallet = await wallet(a, fx.organizationId);
    const count = await a.query(
      `
      SELECT count(*)::int AS n
      FROM public.organization_sms_segment_allocations
      WHERE organization_id = $1 AND state = 'reserved'
      `,
      [fx.organizationId],
    );
    boundaryRace = {
      outcomes: outcomes.map((item) => item.outcome),
      success: outcomes.filter((item) => item.outcome === "reserved").length,
      lost: outcomes.filter((item) => item.outcome === "insufficient").length,
      usage: afterUsage,
      wallet: afterWallet,
      reservedAllocations: count.rows[0].n,
    };
    assert(boundaryRace.success === 1 && boundaryRace.lost === 1, JSON.stringify(boundaryRace));
    assert(afterUsage.reserved === 1 && afterUsage.used === 9, "included not oversubscribed");
    assert(afterWallet.balance === 1 && afterWallet.reserved === 1, "purchased not oversubscribed");
    assert(count.rows[0].n === 1, "one allocation");
  } finally {
    await a.query(`DELETE FROM public.organizations WHERE id = $1`, [fx.organizationId]);
    await a.end();
    await b.end();
  }
});

const leftover = await client.query(
  `
  SELECT count(*)::int AS n
  FROM public.organizations
  WHERE name LIKE 'Phase 4B SMS Test%'
  `,
);
const passed = results.filter((item) => item.pass).length;
console.log(
  JSON.stringify(
    {
      target,
      migrationsThrough: latest,
      passed,
      total: results.length,
      leftoverOrganizations: leftover.rows[0].n,
      eligibility,
      ineligible,
      bounds,
      generationDetail,
      stranded,
      boundaryLedger,
      purchasedDuring,
      purchasedAfter,
      purchasedLedger,
      releaseLedger,
      race,
      boundaryRace,
      results,
    },
    null,
    2,
  ),
);

await client.end();
await postgres.stop();
if (passed !== results.length || leftover.rows[0].n !== 0) process.exitCode = 1;
