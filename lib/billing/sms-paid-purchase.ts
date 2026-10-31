import type { SupabaseClient } from "@supabase/supabase-js";

export const SMS_PAID_PACKAGE_MAX_SEGMENTS = 100_000;
export const SMS_PAID_PACKAGE_KEY_MAX_LENGTH = 200;
export const SMS_PAID_PACKAGE_PROVIDER_ID_MAX_LENGTH = 255;

const FORBIDDEN_METADATA_KEYS = [
  "card",
  "card_number",
  "pan",
  "cvc",
  "cvv",
  "payment_method",
  "bank_account",
  "account_number",
  "provider_payment_id",
  "idempotency_key",
] as const;

export type SmsPaidPackageOutcome =
  | "recorded"
  | "duplicate"
  | "idempotency_mismatch"
  | "reconciliation_required";

export type SmsPaidPackageResult = {
  ok: boolean;
  outcome: SmsPaidPackageOutcome;
  duplicate: boolean;
  transactionId: string | null;
  ledgerId: string | null;
  balance: number;
  reserved: number;
  available: number;
  creditedSegments: number;
  amountCents: number | null;
  taxCents: number | null;
  providerPaymentId: string | null;
  providerPaymentIdNotRecorded: boolean;
};

export type SmsPaidPackageTransaction = {
  id: string;
  idempotencyKey: string;
  transactionType: string;
  status: string;
  currency: string;
  amountCents: number;
  taxCents: number;
  billingProvider: string;
  providerPaymentId: string | null;
  invoiceId: string | null;
};

export type SmsPaidPackageLedgerEntry = {
  id: string;
  idempotencyKey: string;
  delta: number;
  reason: string;
  relatedTransactionId: string | null;
};

export type SmsPaidPackageBooks = {
  balance: number | null;
  reserved: number;
  autoReplenishEnabled: boolean | null;
  transactions: SmsPaidPackageTransaction[];
  ledger: SmsPaidPackageLedgerEntry[];
  nextId: number;
};

export class SmsPaidPackageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsPaidPackageInputError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function assertPaidSmsPackageInput(input: {
  organizationId: string;
  segments: number;
  amountCents: number;
  taxCents?: number | null;
  idempotencyKey: string;
  providerPaymentId?: string | null;
  metadata?: Record<string, unknown> | null;
}): {
  idempotencyKey: string;
  taxCents: number;
  providerPaymentId: string | null;
  metadata: Record<string, unknown>;
} {
  if (!input.organizationId.trim()) {
    throw new SmsPaidPackageInputError(
      "paid application SMS package requires an organization",
    );
  }
  if (
    !Number.isInteger(input.segments) ||
    input.segments <= 0 ||
    input.segments > SMS_PAID_PACKAGE_MAX_SEGMENTS
  ) {
    throw new SmsPaidPackageInputError(
      "paid application SMS package requires a positive segment count",
    );
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new SmsPaidPackageInputError(
      "paid application SMS package requires a positive amount",
    );
  }
  const taxCents = input.taxCents ?? 0;
  if (!Number.isInteger(taxCents) || taxCents < 0) {
    throw new SmsPaidPackageInputError(
      "paid application SMS package tax cannot be negative",
    );
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (
    idempotencyKey.length === 0 ||
    idempotencyKey.length > SMS_PAID_PACKAGE_KEY_MAX_LENGTH
  ) {
    throw new SmsPaidPackageInputError(
      "paid application SMS package requires an idempotency key",
    );
  }
  let providerPaymentId: string | null = null;
  if (input.providerPaymentId != null) {
    providerPaymentId = input.providerPaymentId.trim();
    if (
      providerPaymentId.length === 0 ||
      providerPaymentId.length > SMS_PAID_PACKAGE_PROVIDER_ID_MAX_LENGTH
    ) {
      throw new SmsPaidPackageInputError(
        "paid application SMS package provider payment id is invalid",
      );
    }
  }
  if (Array.isArray(input.metadata)) {
    throw new SmsPaidPackageInputError(
      "paid application SMS package metadata must be a JSON object",
    );
  }
  const metadata = input.metadata ?? {};
  for (const key of FORBIDDEN_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new SmsPaidPackageInputError(
        "paid application SMS package metadata cannot include payment details",
      );
    }
  }
  return { idempotencyKey, taxCents, providerPaymentId, metadata };
}

export function parseSmsPaidPackageResult(value: unknown): SmsPaidPackageResult {
  const row = asRecord(value);
  const outcome = String(row.outcome ?? "") as SmsPaidPackageOutcome;
  if (
    outcome !== "recorded" &&
    outcome !== "duplicate" &&
    outcome !== "idempotency_mismatch" &&
    outcome !== "reconciliation_required"
  ) {
    throw new Error("Unexpected paid SMS package result.");
  }
  const transactionId = row.transaction_id;
  const ledgerId = row.ledger_id;
  const amount = row.amount_cents;
  const tax = row.tax_cents;
  const providerPaymentId = row.provider_payment_id;
  return {
    ok: row.ok === true,
    outcome,
    duplicate: row.duplicate === true,
    transactionId:
      typeof transactionId === "string" && transactionId.length > 0
        ? transactionId
        : null,
    ledgerId: typeof ledgerId === "string" && ledgerId.length > 0 ? ledgerId : null,
    balance: Number(row.balance ?? 0),
    reserved: Number(row.reserved ?? 0),
    available: Number(row.available ?? 0),
    creditedSegments: Number(row.credited_segments ?? 0),
    amountCents: amount === null || amount === undefined ? null : Number(amount),
    taxCents: tax === null || tax === undefined ? null : Number(tax),
    providerPaymentId:
      typeof providerPaymentId === "string" && providerPaymentId.length > 0
        ? providerPaymentId
        : null,
    providerPaymentIdNotRecorded: row.provider_payment_id_not_recorded === true,
  };
}

function unchangedResult(
  books: SmsPaidPackageBooks,
  outcome: "idempotency_mismatch" | "reconciliation_required",
  txn: SmsPaidPackageTransaction | undefined,
  ledger: SmsPaidPackageLedgerEntry | undefined,
): SmsPaidPackageResult {
  const balance = books.balance ?? 0;
  const reserved = books.balance === null ? 0 : books.reserved;
  return {
    ok: false,
    outcome,
    duplicate: outcome === "idempotency_mismatch",
    transactionId: txn?.id ?? null,
    ledgerId: ledger?.id ?? null,
    balance,
    reserved,
    available: balance - reserved,
    creditedSegments: ledger?.delta ?? 0,
    amountCents: txn?.amountCents ?? null,
    taxCents: txn?.taxCents ?? null,
    providerPaymentId: txn?.providerPaymentId ?? null,
    providerPaymentIdNotRecorded: false,
  };
}

/**
 * In-memory mirror of record_paid_application_sms_package.
 * Self-checks use this. Production recording goes through the RPC.
 */
export function recordPaidSmsPackageInMemory(
  books: SmsPaidPackageBooks,
  input: {
    segments: number;
    amountCents: number;
    taxCents?: number | null;
    idempotencyKey: string;
    providerPaymentId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): SmsPaidPackageResult {
  const clean = assertPaidSmsPackageInput({
    organizationId: "organization",
    ...input,
  });
  const txn = books.transactions.find(
    (row) => row.idempotencyKey === clean.idempotencyKey,
  );
  const ledger = books.ledger.find(
    (row) => row.idempotencyKey === clean.idempotencyKey,
  );

  if (txn || ledger) {
    if (!txn || !ledger || ledger.relatedTransactionId !== txn.id) {
      return unchangedResult(books, "reconciliation_required", txn, ledger);
    }
    const factsDiffer =
      txn.transactionType !== "sms_block" ||
      txn.status !== "succeeded" ||
      txn.currency !== "USD" ||
      txn.billingProvider !== "stripe" ||
      txn.amountCents !== input.amountCents ||
      txn.taxCents !== clean.taxCents ||
      txn.invoiceId !== null ||
      ledger.reason !== "manual_purchase" ||
      ledger.delta !== input.segments ||
      (txn.providerPaymentId !== null &&
        clean.providerPaymentId !== null &&
        txn.providerPaymentId !== clean.providerPaymentId);
    if (factsDiffer) {
      return unchangedResult(books, "idempotency_mismatch", txn, ledger);
    }
    const balance = books.balance ?? 0;
    const reserved = books.balance === null ? 0 : books.reserved;
    return {
      ok: true,
      outcome: "duplicate",
      duplicate: true,
      transactionId: txn.id,
      ledgerId: ledger.id,
      balance,
      reserved,
      available: balance - reserved,
      creditedSegments: ledger.delta,
      amountCents: txn.amountCents,
      taxCents: txn.taxCents,
      providerPaymentId: txn.providerPaymentId,
      providerPaymentIdNotRecorded:
        txn.providerPaymentId === null && clean.providerPaymentId !== null,
    };
  }

  if (books.balance === null) {
    books.balance = 0;
    books.reserved = 0;
    books.autoReplenishEnabled = true;
  }
  const txnId = `txn-${books.nextId}`;
  const ledgerId = `ledger-${books.nextId}`;
  books.nextId += 1;
  books.transactions.push({
    id: txnId,
    idempotencyKey: clean.idempotencyKey,
    transactionType: "sms_block",
    status: "succeeded",
    currency: "USD",
    amountCents: input.amountCents,
    taxCents: clean.taxCents,
    billingProvider: "stripe",
    providerPaymentId: clean.providerPaymentId,
    invoiceId: null,
  });
  books.ledger.push({
    id: ledgerId,
    idempotencyKey: clean.idempotencyKey,
    delta: input.segments,
    reason: "manual_purchase",
    relatedTransactionId: txnId,
  });
  books.balance += input.segments;
  return {
    ok: true,
    outcome: "recorded",
    duplicate: false,
    transactionId: txnId,
    ledgerId,
    balance: books.balance,
    reserved: books.reserved,
    available: books.balance - books.reserved,
    creditedSegments: input.segments,
    amountCents: input.amountCents,
    taxCents: clean.taxCents,
    providerPaymentId: clean.providerPaymentId,
    providerPaymentIdNotRecorded: false,
  };
}

/**
 * Server-only wrapper. Pass the service-role client. This does not call
 * Stripe, choose a package, or send an SMS.
 */
export async function recordPaidApplicationSmsPackage(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    segments: number;
    amountCents: number;
    taxCents?: number | null;
    idempotencyKey: string;
    providerPaymentId?: string | null;
    metadata?: Record<string, unknown> | null;
    /**
     * Required: "live". Production SMS credit grants require Live Stripe
     * payment evidence. Test/NULL/missing is refused before any write.
     */
    providerMode?: string | null;
  },
): Promise<SmsPaidPackageResult> {
  if (params.providerMode !== "live") {
    throw new SmsPaidPackageInputError(
      "paid application SMS package requires Live Stripe payment evidence",
    );
  }
  const clean = assertPaidSmsPackageInput(params);
  const { data, error } = await admin.rpc("record_paid_application_sms_package", {
    p_organization_id: params.organizationId,
    p_segments: params.segments,
    p_amount_cents: params.amountCents,
    p_idempotency_key: clean.idempotencyKey,
    p_tax_cents: clean.taxCents,
    p_provider_payment_id: clean.providerPaymentId,
    p_metadata: clean.metadata,
  });
  if (error) throw new Error(error.message);
  const result = parseSmsPaidPackageResult(data);
  if (result.ok && (result.outcome === "recorded" || result.outcome === "duplicate")) {
    await stampSmsPaymentOriginLive(admin, result);
  }
  return result;
}

/**
 * Stamp provider_mode='live' on the payment-origin rows written by the RPC
 * (billing_transactions + SMS credit ledger). Only fills NULL, never overwrites
 * a classified row. Idempotent: webhook retries re-run this on duplicate.
 * The SMS balance itself stays mode-agnostic.
 */
async function stampSmsPaymentOriginLive(
  admin: SupabaseClient,
  result: SmsPaidPackageResult,
): Promise<void> {
  if (result.transactionId) {
    const { error } = await admin
      .from("billing_transactions")
      .update({ provider_mode: "live" })
      .eq("id", result.transactionId)
      .is("provider_mode", null);
    if (error) throw new Error(error.message);
  }
  if (result.ledgerId) {
    const { error } = await admin
      .from("organization_sms_credit_ledger")
      .update({ provider_mode: "live" })
      .eq("id", result.ledgerId)
      .is("provider_mode", null);
    if (error) throw new Error(error.message);
  }
}
