import type { SupabaseClient } from "@supabase/supabase-js";

export const SMS_PURCHASE_MAX_SEGMENTS = 100_000;
export const SMS_PURCHASE_KEY_MAX_LENGTH = 200;

const FORBIDDEN_METADATA_KEYS = [
  "card",
  "pan",
  "cvc",
  "cvv",
  "payment_method",
  "account_number",
] as const;

export type SmsPurchaseCreditOutcome =
  | "credited"
  | "duplicate"
  | "idempotency_mismatch";

export type SmsPurchaseCreditResult = {
  ok: boolean;
  outcome: SmsPurchaseCreditOutcome;
  duplicate: boolean;
  balance: number;
  reserved: number;
  available: number;
  creditedSegments: number;
};

export type SmsPurchaseCreditBooks = {
  /** Null means the organization has no balance row yet. */
  balance: number | null;
  reserved: number;
  autoReplenishEnabled: boolean | null;
  lowBalanceThreshold: number | null;
  ledger: Array<{
    idempotencyKey: string;
    delta: number;
    reason: "manual_purchase";
    metadata: Record<string, unknown>;
  }>;
};

export class SmsPurchaseCreditInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsPurchaseCreditInputError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function assertPurchaseCreditInput(input: {
  organizationId: string;
  segments: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
}): { idempotencyKey: string; metadata: Record<string, unknown> } {
  if (!input.organizationId.trim()) {
    throw new SmsPurchaseCreditInputError(
      "application SMS purchase credit requires an organization",
    );
  }
  if (
    !Number.isInteger(input.segments) ||
    input.segments <= 0 ||
    input.segments > SMS_PURCHASE_MAX_SEGMENTS
  ) {
    throw new SmsPurchaseCreditInputError(
      "application SMS purchase credit requires a positive segment count",
    );
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (
    idempotencyKey.length === 0 ||
    idempotencyKey.length > SMS_PURCHASE_KEY_MAX_LENGTH
  ) {
    throw new SmsPurchaseCreditInputError(
      "application SMS purchase credit requires an idempotency key",
    );
  }
  const metadata = input.metadata ?? {};
  if (Array.isArray(input.metadata)) {
    throw new SmsPurchaseCreditInputError(
      "application SMS purchase credit metadata must be a JSON object",
    );
  }
  for (const key of FORBIDDEN_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new SmsPurchaseCreditInputError(
        "application SMS purchase credit metadata cannot include payment details",
      );
    }
  }
  return { idempotencyKey, metadata };
}

export function parseSmsPurchaseCreditResult(
  value: unknown,
): SmsPurchaseCreditResult {
  const row = asRecord(value);
  const outcome = String(row.outcome ?? "") as SmsPurchaseCreditOutcome;
  if (
    outcome !== "credited" &&
    outcome !== "duplicate" &&
    outcome !== "idempotency_mismatch"
  ) {
    throw new Error("Unexpected SMS purchase credit result.");
  }
  return {
    ok: row.ok === true,
    outcome,
    duplicate: row.duplicate === true,
    balance: Number(row.balance ?? 0),
    reserved: Number(row.reserved ?? 0),
    available: Number(row.available ?? 0),
    creditedSegments: Number(row.credited_segments ?? 0),
  };
}

/**
 * In-memory mirror of credit_purchased_application_sms_segments.
 * Self-checks use this. Production crediting goes through the RPC.
 */
export function creditPurchasedSmsInMemory(
  books: SmsPurchaseCreditBooks,
  input: {
    segments: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
  },
): SmsPurchaseCreditResult {
  const clean = assertPurchaseCreditInput({
    organizationId: "organization",
    segments: input.segments,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
  });
  const existing = books.ledger.find(
    (row) => row.idempotencyKey === clean.idempotencyKey,
  );
  const reserved = books.balance === null ? 0 : books.reserved;
  const balance = books.balance ?? 0;

  if (existing) {
    if (existing.delta !== input.segments || existing.reason !== "manual_purchase") {
      return {
        ok: false,
        outcome: "idempotency_mismatch",
        duplicate: true,
        balance,
        reserved,
        available: balance - reserved,
        creditedSegments: existing.delta,
      };
    }
    return {
      ok: true,
      outcome: "duplicate",
      duplicate: true,
      balance,
      reserved,
      available: balance - reserved,
      creditedSegments: existing.delta,
    };
  }

  if (books.balance === null) {
    books.balance = 0;
    books.reserved = 0;
    books.autoReplenishEnabled = true;
    books.lowBalanceThreshold = 25;
  }

  books.ledger.push({
    idempotencyKey: clean.idempotencyKey,
    delta: input.segments,
    reason: "manual_purchase",
    metadata: clean.metadata,
  });
  books.balance += input.segments;

  return {
    ok: true,
    outcome: "credited",
    duplicate: false,
    balance: books.balance,
    reserved: books.reserved,
    available: books.balance - books.reserved,
    creditedSegments: input.segments,
  };
}

/**
 * Server-only wrapper. Pass the service-role client. This does not call
 * Stripe, choose a price, or send an SMS.
 */
export async function creditPurchasedApplicationSmsSegments(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    segments: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<SmsPurchaseCreditResult> {
  const clean = assertPurchaseCreditInput(params);
  const { data, error } = await admin.rpc(
    "credit_purchased_application_sms_segments",
    {
      p_organization_id: params.organizationId,
      p_segments: params.segments,
      p_idempotency_key: clean.idempotencyKey,
      p_metadata: clean.metadata,
    },
  );
  if (error) throw new Error(error.message);
  return parseSmsPurchaseCreditResult(data);
}
