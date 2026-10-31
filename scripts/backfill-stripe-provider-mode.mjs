/**
 * Stage 2B controlled backfill: classify Stripe-backed billing rows as
 * live | test | leave NULL (UNKNOWN) using Stripe CLI evidence only.
 *
 * Usage:
 *   node scripts/backfill-stripe-provider-mode.mjs           # dry-run
 *   node scripts/backfill-stripe-provider-mode.mjs --execute # write classifications
 *
 * Uses `stripe … --live` / `stripe …` (test) CLI retrieves — no secret key in process.
 * Never guesses from ID prefix, status, or Production DB presence.
 * Does not mutate Stripe objects.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function loadEnvLocal() {
  const raw = readFileSync(".env.local", "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const EXECUTE = process.argv.includes("--execute");
const EXPECTED_ACCOUNT = "acct_1UGx3WRxaGtyRkAV";

const LIVE_ANCHORS = {
  customers: new Set([
    "cus_VXF87Nk1GozLLN",
    "cus_VUysRUeirHG1Eu",
    "cus_VUzT1qN5tPBhn7",
    "cus_VUbjJ9KUtHS24E",
  ]),
  subscriptions: new Set([
    "sub_1UWB4zRxaGtyRkAVZxMBxfe7",
    "sub_1UTyweRxaGtyRkAVtQ2pHboS",
    "sub_1UTzk0RxaGtyRkAVh1PkydeZ",
  ]),
  invoices: new Set(["in_1UWB4wRxaGtyRkAVXM2XrYZX"]),
};

const env = { ...loadEnvLocal(), ...process.env };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cache = {
  customer: new Map(),
  subscription: new Map(),
  invoice: new Map(),
};

function stripeRetrieve(resource, id, live) {
  const args = [resource, "retrieve", id];
  if (live) args.push("--live");
  const result = spawnSync("stripe", args, {
    encoding: "utf8",
    shell: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = `${result.stderr || ""}${result.stdout || ""}`;
    if (/No such|resource_missing|could not be found/i.test(err)) {
      return { missing: true };
    }
    return { error: err.slice(0, 240) };
  }
  const text = (result.stdout || "").trim();
  const start = text.indexOf("{");
  if (start < 0) return { error: "no_json" };
  try {
    return { object: JSON.parse(text.slice(start)) };
  } catch {
    return { error: "json_parse" };
  }
}

async function classifyByRetrieve(kind, id) {
  if (!id || typeof id !== "string") {
    return { mode: null, accountId: null, how: "missing_id" };
  }
  const map = cache[kind];
  if (map.has(id)) return map.get(id);

  const resource =
    kind === "customer"
      ? "customers"
      : kind === "subscription"
        ? "subscriptions"
        : "invoices";

  const liveHit = stripeRetrieve(resource, id, true);
  if (liveHit.object && liveHit.object.livemode === true && !liveHit.object.deleted) {
    const result = {
      mode: "live",
      accountId: EXPECTED_ACCOUNT,
      how: "live_cli_retrieve",
    };
    map.set(id, result);
    return result;
  }
  if (liveHit.error) {
    console.warn(`live_cli_warn ${kind} ${id}: ${liveHit.error}`);
  }

  const testHit = stripeRetrieve(resource, id, false);
  if (testHit.object && testHit.object.livemode === false && !testHit.object.deleted) {
    const result = { mode: "test", accountId: null, how: "test_cli_retrieve" };
    map.set(id, result);
    return result;
  }

  const result = { mode: null, accountId: null, how: "unknown" };
  map.set(id, result);
  return result;
}

function bump(counts, mode) {
  if (mode === "live") counts.live += 1;
  else if (mode === "test") counts.test += 1;
  else counts.unknown += 1;
}

async function updateRow(table, id, patch) {
  if (!EXECUTE) return;
  const { error } = await sb.from(table).update(patch).eq("id", id);
  if (error) throw new Error(`${table} ${id}: ${error.message}`);
}

async function backfillSubscriptions() {
  const counts = { live: 0, test: 0, unknown: 0, skipped: 0 };
  const { data, error } = await sb
    .from("organization_subscriptions")
    .select(
      "id,billing_provider,billing_customer_id,billing_subscription_id,provider_mode,stripe_account_id",
    )
    .limit(500);
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    if (row.provider_mode === "live" || row.provider_mode === "test") {
      counts.skipped += 1;
      continue;
    }
    const subId = row.billing_subscription_id;
    if (!subId) {
      counts.skipped += 1;
      continue;
    }
    const classified = await classifyByRetrieve("subscription", subId);
    bump(counts, classified.mode);
    if (classified.mode) {
      await updateRow("organization_subscriptions", row.id, {
        provider_mode: classified.mode,
        ...(classified.accountId
          ? { stripe_account_id: classified.accountId }
          : {}),
      });
    }
    console.log(
      JSON.stringify({
        table: "organization_subscriptions",
        id: row.id,
        subId,
        mode: classified.mode,
        how: classified.how,
        anchor: LIVE_ANCHORS.subscriptions.has(subId),
      }),
    );
  }
  return counts;
}

async function backfillProfiles() {
  const counts = { live: 0, test: 0, unknown: 0, skipped: 0 };
  const { data, error } = await sb
    .from("organization_billing_profiles")
    .select("organization_id,provider_customer_id,provider_mode,billing_provider")
    .eq("billing_provider", "stripe")
    .limit(500);
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    if (row.provider_mode === "live" || row.provider_mode === "test") {
      counts.skipped += 1;
      continue;
    }
    const cusId = row.provider_customer_id;
    if (!cusId) {
      counts.skipped += 1;
      continue;
    }
    const classified = await classifyByRetrieve("customer", cusId);
    bump(counts, classified.mode);
    if (classified.mode && EXECUTE) {
      const { error: upErr } = await sb
        .from("organization_billing_profiles")
        .update({
          provider_mode: classified.mode,
          ...(classified.accountId
            ? { stripe_account_id: classified.accountId }
            : {}),
        })
        .eq("organization_id", row.organization_id)
        .eq("billing_provider", "stripe");
      if (upErr) throw new Error(upErr.message);
    }
    console.log(
      JSON.stringify({
        table: "organization_billing_profiles",
        organization_id: row.organization_id,
        cusId,
        mode: classified.mode,
        how: classified.how,
        anchor: LIVE_ANCHORS.customers.has(cusId),
      }),
    );
  }
  return counts;
}

async function backfillBillingCustomers() {
  const counts = { live: 0, test: 0, unknown: 0, skipped: 0 };
  const { data, error } = await sb
    .from("billing_customers")
    .select("id,provider_customer_id,provider_mode,billing_provider")
    .eq("billing_provider", "stripe")
    .limit(500);
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    if (row.provider_mode === "live" || row.provider_mode === "test") {
      counts.skipped += 1;
      continue;
    }
    const cusId = row.provider_customer_id;
    if (!cusId) {
      counts.skipped += 1;
      continue;
    }
    const classified = await classifyByRetrieve("customer", cusId);
    bump(counts, classified.mode);
    if (classified.mode) {
      await updateRow("billing_customers", row.id, {
        provider_mode: classified.mode,
        ...(classified.accountId
          ? { stripe_account_id: classified.accountId }
          : {}),
      });
    }
    console.log(
      JSON.stringify({
        table: "billing_customers",
        id: row.id,
        cusId,
        mode: classified.mode,
        how: classified.how,
        anchor: LIVE_ANCHORS.customers.has(cusId),
      }),
    );
  }
  return counts;
}

async function backfillInvoices() {
  const counts = { live: 0, test: 0, unknown: 0, skipped: 0 };
  const { data, error } = await sb
    .from("billing_invoices")
    .select("id,provider_invoice_id,provider_mode,billing_provider")
    .eq("billing_provider", "stripe")
    .limit(500);
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    if (row.provider_mode === "live" || row.provider_mode === "test") {
      counts.skipped += 1;
      continue;
    }
    const invId = row.provider_invoice_id;
    if (!invId) {
      counts.skipped += 1;
      continue;
    }
    const classified = await classifyByRetrieve("invoice", invId);
    bump(counts, classified.mode);
    if (classified.mode) {
      await updateRow("billing_invoices", row.id, {
        provider_mode: classified.mode,
        ...(classified.accountId
          ? { stripe_account_id: classified.accountId }
          : {}),
      });
    }
    console.log(
      JSON.stringify({
        table: "billing_invoices",
        id: row.id,
        invId,
        mode: classified.mode,
        how: classified.how,
        anchor: LIVE_ANCHORS.invoices.has(invId),
      }),
    );
  }
  return counts;
}

async function backfillTransactionsFromMetadata() {
  const counts = { live: 0, test: 0, unknown: 0, skipped: 0 };
  const { data, error } = await sb
    .from("billing_transactions")
    .select("id,provider_invoice_id,provider_mode,billing_provider")
    .eq("billing_provider", "stripe")
    .limit(500);
  if (error) throw new Error(error.message);

  for (const row of data || []) {
    if (row.provider_mode === "live" || row.provider_mode === "test") {
      counts.skipped += 1;
      continue;
    }
    const invId = row.provider_invoice_id;
    if (!invId) {
      bump(counts, null);
      continue;
    }
    const classified = await classifyByRetrieve("invoice", invId);
    bump(counts, classified.mode);
    if (classified.mode) {
      await updateRow("billing_transactions", row.id, {
        provider_mode: classified.mode,
        ...(classified.accountId
          ? { stripe_account_id: classified.accountId }
          : {}),
      });
    }
    console.log(
      JSON.stringify({
        table: "billing_transactions",
        id: row.id,
        invId,
        mode: classified.mode,
        how: classified.how,
      }),
    );
  }
  return counts;
}

async function main() {
  console.log(
    JSON.stringify({
      execute: EXECUTE,
      expectedAccount: EXPECTED_ACCOUNT,
      method: "stripe_cli_retrieve",
    }),
  );

  const results = {
    organization_subscriptions: await backfillSubscriptions(),
    organization_billing_profiles: await backfillProfiles(),
    billing_customers: await backfillBillingCustomers(),
    billing_invoices: await backfillInvoices(),
    billing_transactions: await backfillTransactionsFromMetadata(),
  };

  console.log(JSON.stringify({ summary: results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
