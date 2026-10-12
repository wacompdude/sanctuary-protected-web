/**
 * Paid application SMS package record self-check.
 * No Stripe, Bird, Supabase, or email network calls.
 * Run: npx --yes tsx lib/billing/sms-paid-purchase.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  recordPaidSmsPackageInMemory,
  type SmsPaidPackageBooks,
} from "@/lib/billing/sms-paid-purchase";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function emptyBooks(): SmsPaidPackageBooks {
  return {
    balance: null,
    reserved: 0,
    autoReplenishEnabled: null,
    transactions: [],
    ledger: [],
    nextId: 1,
  };
}

function main() {
  const books = emptyBooks();
  const first = recordPaidSmsPackageInMemory(books, {
    segments: 100,
    amountCents: 1000,
    taxCents: 0,
    idempotencyKey: "sms:purchase:cs_a",
    providerPaymentId: "pi_a",
    metadata: { package_key: "sms_block_100" },
  });
  const txn = books.transactions[0];
  const ledger = books.ledger[0];
  assert(first.ok && first.outcome === "recorded" && !first.duplicate, "1 new purchase");
  assert(txn?.transactionType === "sms_block", "2 sms_block");
  assert(txn?.status === "succeeded", "3 succeeded");
  assert(txn?.currency === "USD", "4 USD");
  assert(txn?.amountCents === 1000 && first.amountCents === 1000, "5 amount");
  assert(txn?.taxCents === 0 && first.taxCents === 0, "6 tax");
  assert(txn?.providerPaymentId === "pi_a", "7 provider payment id");
  assert(txn?.invoiceId === null, "8 invoice null");
  assert(ledger?.reason === "manual_purchase", "9 ledger reason");
  assert(ledger?.delta === 100, "10 positive delta");
  assert(ledger?.relatedTransactionId === txn?.id, "11 related transaction");
  assert(books.balance === 100 && first.creditedSegments === 100, "12 balance");
  assert(books.reserved === 0 && first.reserved === 0, "13 reserved");
  assert(books.autoReplenishEnabled === true, "14 missing row initialized");

  const replay = recordPaidSmsPackageInMemory(books, {
    segments: 100,
    amountCents: 1000,
    taxCents: 0,
    idempotencyKey: "sms:purchase:cs_a",
    providerPaymentId: "pi_a",
  });
  assert(
    replay.ok &&
      replay.duplicate &&
      replay.outcome === "duplicate" &&
      books.balance === 100 &&
      books.transactions.length === 1 &&
      books.ledger.length === 1,
    "16-19 duplicate does not write again",
  );

  const segmentMismatch = recordPaidSmsPackageInMemory(books, {
    segments: 500,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_a",
    providerPaymentId: "pi_a",
  });
  assert(
    !segmentMismatch.ok &&
      segmentMismatch.outcome === "idempotency_mismatch" &&
      books.balance === 100,
    "20 segment mismatch",
  );
  const amountMismatch = recordPaidSmsPackageInMemory(books, {
    segments: 100,
    amountCents: 4000,
    idempotencyKey: "sms:purchase:cs_a",
    providerPaymentId: "pi_a",
  });
  assert(!amountMismatch.ok && amountMismatch.outcome === "idempotency_mismatch", "21 amount");
  const taxMismatch = recordPaidSmsPackageInMemory(books, {
    segments: 100,
    amountCents: 1000,
    taxCents: 80,
    idempotencyKey: "sms:purchase:cs_a",
    providerPaymentId: "pi_a",
  });
  assert(!taxMismatch.ok && taxMismatch.outcome === "idempotency_mismatch", "22 tax");

  const wrongType = emptyBooks();
  wrongType.balance = 100;
  wrongType.transactions.push({
    id: "txn-x",
    idempotencyKey: "sms:purchase:cs_type",
    transactionType: "payment",
    status: "succeeded",
    currency: "USD",
    amountCents: 1000,
    taxCents: 0,
    billingProvider: "stripe",
    providerPaymentId: "pi_x",
    invoiceId: null,
  });
  wrongType.ledger.push({
    id: "ledger-x",
    idempotencyKey: "sms:purchase:cs_type",
    delta: 100,
    reason: "manual_purchase",
    relatedTransactionId: "txn-x",
  });
  assert(
    recordPaidSmsPackageInMemory(wrongType, {
      segments: 100,
      amountCents: 1000,
      idempotencyKey: "sms:purchase:cs_type",
      providerPaymentId: "pi_x",
    }).outcome === "idempotency_mismatch",
    "23 wrong type",
  );
  wrongType.transactions[0]!.transactionType = "sms_block";
  wrongType.transactions[0]!.status = "pending";
  assert(
    recordPaidSmsPackageInMemory(wrongType, {
      segments: 100,
      amountCents: 1000,
      idempotencyKey: "sms:purchase:cs_type",
      providerPaymentId: "pi_x",
    }).outcome === "idempotency_mismatch",
    "24 not succeeded",
  );
  wrongType.transactions[0]!.status = "succeeded";
  wrongType.transactions[0]!.currency = "EUR";
  assert(
    recordPaidSmsPackageInMemory(wrongType, {
      segments: 100,
      amountCents: 1000,
      idempotencyKey: "sms:purchase:cs_type",
      providerPaymentId: "pi_x",
    }).outcome === "idempotency_mismatch",
    "25 non-USD",
  );
  wrongType.transactions[0]!.currency = "USD";
  wrongType.ledger[0]!.reason = "consume";
  assert(
    recordPaidSmsPackageInMemory(wrongType, {
      segments: 100,
      amountCents: 1000,
      idempotencyKey: "sms:purchase:cs_type",
      providerPaymentId: "pi_x",
    }).outcome === "idempotency_mismatch",
    "26 wrong ledger reason",
  );
  wrongType.ledger[0]!.reason = "manual_purchase";
  wrongType.ledger[0]!.relatedTransactionId = "other-txn";
  const wrongLink = recordPaidSmsPackageInMemory(wrongType, {
    segments: 100,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_type",
    providerPaymentId: "pi_x",
  });
  assert(
    wrongLink.outcome === "reconciliation_required" && wrongType.balance === 100,
    "27 wrong relationship",
  );

  const paymentMismatch = emptyBooks();
  paymentMismatch.balance = 50;
  paymentMismatch.transactions.push({
    id: "txn-p",
    idempotencyKey: "sms:purchase:cs_pay",
    transactionType: "sms_block",
    status: "succeeded",
    currency: "USD",
    amountCents: 1000,
    taxCents: 0,
    billingProvider: "stripe",
    providerPaymentId: "pi_original",
    invoiceId: null,
  });
  paymentMismatch.ledger.push({
    id: "ledger-p",
    idempotencyKey: "sms:purchase:cs_pay",
    delta: 100,
    reason: "manual_purchase",
    relatedTransactionId: "txn-p",
  });
  const differentPayment = recordPaidSmsPackageInMemory(paymentMismatch, {
    segments: 100,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_pay",
    providerPaymentId: "pi_other",
  });
  assert(
    differentPayment.outcome === "idempotency_mismatch" &&
      paymentMismatch.transactions[0]?.providerPaymentId === "pi_original",
    "28 provider ids differ",
  );

  const missingId = emptyBooks();
  const createdWithoutPayment = recordPaidSmsPackageInMemory(missingId, {
    segments: 50,
    amountCents: 500,
    idempotencyKey: "sms:purchase:cs_null",
    providerPaymentId: null,
  });
  const laterPayment = recordPaidSmsPackageInMemory(missingId, {
    segments: 50,
    amountCents: 500,
    idempotencyKey: "sms:purchase:cs_null",
    providerPaymentId: "pi_later",
  });
  assert(
    createdWithoutPayment.providerPaymentId === null &&
      laterPayment.ok &&
      laterPayment.duplicate &&
      laterPayment.providerPaymentIdNotRecorded &&
      laterPayment.providerPaymentId === null &&
      missingId.balance === 50 &&
      missingId.transactions[0]?.providerPaymentId === null,
    "29 stored null does not adopt a later payment id",
  );

  const omitPayment = recordPaidSmsPackageInMemory(books, {
    segments: 100,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_a",
    providerPaymentId: null,
  });
  assert(
    omitPayment.ok &&
      omitPayment.duplicate &&
      !omitPayment.providerPaymentIdNotRecorded &&
      omitPayment.providerPaymentId === "pi_a" &&
      books.transactions[0]?.providerPaymentId === "pi_a",
    "30 replay without payment id keeps the stored id",
  );

  const txnOnly = emptyBooks();
  txnOnly.balance = 10;
  txnOnly.transactions.push({
    id: "txn-only",
    idempotencyKey: "sms:purchase:cs_txn",
    transactionType: "sms_block",
    status: "succeeded",
    currency: "USD",
    amountCents: 1000,
    taxCents: 0,
    billingProvider: "stripe",
    providerPaymentId: null,
    invoiceId: null,
  });
  const txnOnlyResult = recordPaidSmsPackageInMemory(txnOnly, {
    segments: 100,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_txn",
  });
  assert(
    txnOnlyResult.outcome === "reconciliation_required" &&
      txnOnly.balance === 10 &&
      txnOnly.ledger.length === 0,
    "29 transaction only",
  );

  const ledgerOnly = emptyBooks();
  ledgerOnly.balance = 10;
  ledgerOnly.ledger.push({
    id: "ledger-only",
    idempotencyKey: "sms:purchase:cs_led",
    delta: 100,
    reason: "manual_purchase",
    relatedTransactionId: null,
  });
  const ledgerOnlyResult = recordPaidSmsPackageInMemory(ledgerOnly, {
    segments: 100,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_led",
  });
  assert(
    ledgerOnlyResult.outcome === "reconciliation_required" &&
      ledgerOnly.transactions.length === 0 &&
      ledgerOnly.balance === 10,
    "30 ledger only",
  );

  const second = recordPaidSmsPackageInMemory(books, {
    segments: 100,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_b",
    providerPaymentId: "pi_b",
  });
  assert(
    second.outcome === "recorded" &&
      books.balance === 200 &&
      books.transactions.length === 2 &&
      books.ledger.length === 2,
    "31 two purchases",
  );

  const existingReserved = emptyBooks();
  existingReserved.balance = 40;
  existingReserved.reserved = 5;
  existingReserved.autoReplenishEnabled = false;
  const added = recordPaidSmsPackageInMemory(existingReserved, {
    segments: 100,
    amountCents: 1000,
    idempotencyKey: "sms:purchase:cs_existing",
  });
  assert(
    added.balance === 140 &&
      added.reserved === 5 &&
      existingReserved.autoReplenishEnabled === false,
    "existing reserved and configuration stay unchanged",
  );

  const sql = readRepo(
    "supabase/migrations/108_record_paid_application_sms_package.sql",
  );
  const smsA = readRepo("supabase/migrations/106_application_sms_capacity.sql");
  const credit = readRepo(
    "supabase/migrations/107_credit_purchased_application_sms.sql",
  );
  assert(sql.includes("application_sms_capacity_lock(p_organization_id)"), "15 lock");
  assert(sql.includes("SECURITY DEFINER"), "32 security definer");
  assert(sql.includes("SET search_path = public"), "search_path");
  assert(
    sql.includes(
      "REVOKE ALL ON FUNCTION public.record_paid_application_sms_package(uuid, integer, integer, text, integer, text, jsonb) FROM PUBLIC",
    ),
    "32 public revoked",
  );
  assert(sql.includes("FROM anon"), "33 anon revoked");
  assert(sql.includes("FROM authenticated"), "34 authenticated revoked");
  assert(
    sql.includes(
      "GRANT EXECUTE ON FUNCTION public.record_paid_application_sms_package(uuid, integer, integer, text, integer, text, jsonb) TO service_role",
    ),
    "35 service_role granted",
  );
  assert(!sql.includes("TO authenticated") && !sql.includes("TO anon"), "no browser grant");
  assert(!credit.includes("record_paid_application_sms_package"), "36 migration 107 unchanged by name");
  assert(!smsA.includes("record_paid_application_sms_package"), "37 migration 106 unchanged by name");
  assert(!sql.includes("CREATE OR REPLACE FUNCTION public.reserve_application_sms_segments"), "38 reserve untouched");
  assert(!sql.includes("CREATE OR REPLACE FUNCTION public.commit_application_sms_segments"), "38 commit untouched");
  assert(!sql.includes("CREATE OR REPLACE FUNCTION public.release_application_sms_segments"), "38 release untouched");
  assert(!sql.includes("'refund'"), "39 no refund behavior");
  assert(!sql.includes("auto_replenish_enabled ="), "40 auto-replenish not updated");
  assert(sql.includes("invoice_id"), "invoice column is explicit null");
  assert(sql.includes("'sms_block'"), "sql transaction type");
  assert(sql.includes("'manual_purchase'"), "sql ledger reason");
  assert(sql.includes("related_transaction_id"), "sql links ledger");

  const webhook = readRepo("lib/billing/stripe/webhook-sync.ts");
  assert(
    !webhook.includes("record_paid_application_sms_package"),
    "webhook is not wired yet",
  );
  const wrapper = readRepo("lib/billing/sms-paid-purchase.ts");
  assert(!wrapper.includes("stripe.checkout"), "wrapper does not create Checkout");
  assert(!wrapper.toLowerCase().includes("messagebird"), "wrapper does not call Bird");

  console.log("sms-paid-purchase.selfcheck: ok");
}

main();
