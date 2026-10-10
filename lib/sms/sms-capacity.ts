/**
 * Application SMS capacity rules.
 *
 * Production serialization is the Postgres advisory lock in migration 106.
 * This module is the pure decision model used by self-checks and by the
 * in-memory stand-in for that lock. Dispatch must call the RPCs, not this
 * module, to reserve or consume credits.
 */

export type SmsSubscriptionAccess = "eligible" | "cancelled" | "none";

export type SmsCapacityOutcome =
  | "reserved"
  | "committed"
  | "released"
  | "insufficient"
  | "ineligible"
  | "duplicate"
  | "conflict"
  | "missing"
  | "stranded";

export type SmsCapacityResult = {
  ok: boolean;
  outcome: SmsCapacityOutcome;
  requestedSegments: number;
  includedSegments: number;
  purchasedSegments: number;
  duplicate: boolean;
  sendAllowed?: boolean;
};

export type SmsUsageEvent = {
  usageKey: string;
  eventType: "reserve" | "consume" | "release";
  quantity: number;
  metadata: Record<string, unknown>;
};

export type SmsLedgerEntry = {
  reason: "reserve" | "release_reserve" | "consume";
  delta: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
};

type Allocation = {
  state: "reserved" | "committed" | "released";
  requested: number;
  included: number;
  purchased: number;
  generation: number;
  sendStarted: boolean;
};

export type SmsCapacityBooks = {
  access: SmsSubscriptionAccess;
  includedLimit: number;
  includedUsed: number;
  includedReserved: number;
  /** Null means the organization has no credit-balance row. */
  purchasedBalance: number | null;
  purchasedReserved: number;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  allocations: Map<string, Allocation>;
  usageEvents: SmsUsageEvent[];
  ledger: SmsLedgerEntry[];
};

const SENSITIVE_KEYS = new Set([
  "body",
  "text",
  "message",
  "phone",
  "phone_number",
  "destination",
  "normalized_destination",
]);

export function createSmsCapacityBooks(input: {
  access?: SmsSubscriptionAccess;
  includedLimit: number;
  includedUsed?: number;
  includedReserved?: number;
  purchasedBalance?: number | null;
  purchasedReserved?: number;
  subscriptionId?: string;
  periodStart?: string;
  periodEnd?: string;
}): SmsCapacityBooks {
  return {
    access: input.access ?? "eligible",
    includedLimit: input.includedLimit,
    includedUsed: input.includedUsed ?? 0,
    includedReserved: input.includedReserved ?? 0,
    purchasedBalance:
      input.purchasedBalance === undefined ? null : input.purchasedBalance,
    purchasedReserved: input.purchasedReserved ?? 0,
    subscriptionId: input.subscriptionId ?? "sub",
    periodStart: input.periodStart ?? "2026-10-08T00:00:00.000Z",
    periodEnd: input.periodEnd ?? "2026-11-08T00:00:00.000Z",
    allocations: new Map(),
    usageEvents: [],
    ledger: [],
  };
}

export function purchasedAvailable(books: SmsCapacityBooks): number {
  if (books.purchasedBalance === null) return 0;
  return books.purchasedBalance - books.purchasedReserved;
}

export function includedRemaining(books: SmsCapacityBooks): number {
  return Math.max(
    0,
    books.includedLimit - books.includedUsed - books.includedReserved,
  );
}

export function planSmsSegmentFunding(
  books: SmsCapacityBooks,
  requested: number,
): { included: number; purchased: number } | null {
  const includedLeft = includedRemaining(books);
  const purchasedLeft = purchasedAvailable(books);
  if (includedLeft + purchasedLeft < requested) return null;
  const included = Math.min(includedLeft, requested);
  return { included, purchased: requested - included };
}

export function smsAllocationMetadata(
  books: SmsCapacityBooks,
  deliveryId: string,
  requested: number,
  included: number,
  purchased: number,
): Record<string, unknown> {
  const metadata = {
    delivery_id: deliveryId,
    segment_quantity: requested,
    included_segments: included,
    purchased_segments: purchased,
    subscription_id: books.subscriptionId,
    period_start: books.periodStart,
    period_end: books.periodEnd,
  };
  assertNoSensitiveSmsMetadata(metadata);
  return metadata;
}

export function assertNoSensitiveSmsMetadata(
  metadata: Record<string, unknown>,
): void {
  for (const key of Object.keys(metadata)) {
    if (SENSITIVE_KEYS.has(key)) {
      throw new Error(`SMS ledger metadata must not include ${key}.`);
    }
  }
}

function result(
  outcome: SmsCapacityOutcome,
  requested: number,
  included = 0,
  purchased = 0,
  duplicate = false,
): SmsCapacityResult {
  const ok =
    outcome === "reserved" ||
    outcome === "committed" ||
    outcome === "released" ||
    outcome === "duplicate";
  return {
    ok,
    outcome,
    requestedSegments: requested,
    includedSegments: included,
    purchasedSegments: purchased,
    duplicate,
  };
}

function applyHold(
  books: SmsCapacityBooks,
  deliveryId: string,
  requested: number,
  included: number,
  purchased: number,
  generation: number,
): void {
  const metadata = smsAllocationMetadata(
    books,
    deliveryId,
    requested,
    included,
    purchased,
  );
  if (included > 0) {
    books.includedReserved += included;
    books.usageEvents.push({
      usageKey: `sms:reserve:delivery:${deliveryId}:g:${generation}`,
      eventType: "reserve",
      quantity: included,
      metadata,
    });
  }
  if (purchased > 0) {
    books.purchasedReserved += purchased;
    books.ledger.push({
      reason: "reserve",
      delta: 0,
      idempotencyKey: `sms:reserve:delivery:${deliveryId}:g:${generation}`,
      metadata,
    });
  }
}

export function reserveApplicationSms(
  books: SmsCapacityBooks,
  deliveryId: string,
  requested: number,
): SmsCapacityResult {
  if (!Number.isInteger(requested) || requested <= 0) {
    return result("conflict", requested);
  }
  if (books.access !== "eligible") {
    return result("ineligible", requested);
  }

  const existing = books.allocations.get(deliveryId);
  if (existing?.state === "committed") {
    return {
      ...result(
        "committed",
        existing.requested,
        existing.included,
        existing.purchased,
        true,
      ),
      ok: true,
    };
  }
  if (existing?.state === "reserved") {
    if (existing.requested !== requested) return result("conflict", requested);
    return result(
      "reserved",
      existing.requested,
      existing.included,
      existing.purchased,
      true,
    );
  }

  const funding = planSmsSegmentFunding(books, requested);
  if (!funding) return result("insufficient", requested);

  const generation = existing ? existing.generation + 1 : 1;
  applyHold(
    books,
    deliveryId,
    requested,
    funding.included,
    funding.purchased,
    generation,
  );
  books.allocations.set(deliveryId, {
    state: "reserved",
    requested,
    included: funding.included,
    purchased: funding.purchased,
    generation,
    sendStarted: false,
  });
  return result("reserved", requested, funding.included, funding.purchased);
}

export function markApplicationSmsSendStarted(
  books: SmsCapacityBooks,
  deliveryId: string,
): SmsCapacityResult {
  const existing = books.allocations.get(deliveryId);
  if (!existing) return result("missing", 0);
  if (existing.state === "committed") {
    return {
      ...result(
        "committed",
        existing.requested,
        existing.included,
        existing.purchased,
        true,
      ),
      ok: true,
      sendAllowed: false,
    };
  }
  if (existing.state !== "reserved") return result("conflict", existing.requested);
  if (existing.sendStarted) {
    return {
      ...result(
        "stranded",
        existing.requested,
        existing.included,
        existing.purchased,
      ),
      ok: false,
      sendAllowed: false,
    };
  }
  existing.sendStarted = true;
  return {
    ...result(
      "reserved",
      existing.requested,
      existing.included,
      existing.purchased,
    ),
    sendAllowed: true,
  };
}

export function commitApplicationSms(
  books: SmsCapacityBooks,
  deliveryId: string,
): SmsCapacityResult {
  const existing = books.allocations.get(deliveryId);
  if (!existing) return result("missing", 0);
  if (existing.state === "committed") {
    return {
      ...result(
        "committed",
        existing.requested,
        existing.included,
        existing.purchased,
        true,
      ),
      ok: true,
    };
  }
  if (existing.state !== "reserved") return result("conflict", existing.requested);

  const metadata = smsAllocationMetadata(
    books,
    deliveryId,
    existing.requested,
    existing.included,
    existing.purchased,
  );
  if (existing.included > 0) {
    books.includedReserved -= existing.included;
    books.includedUsed += existing.included;
    books.usageEvents.push({
      usageKey: `sms:release:delivery:${deliveryId}:g:${existing.generation}`,
      eventType: "release",
      quantity: existing.included,
      metadata,
    });
    books.usageEvents.push({
      usageKey: `sms:consume:delivery:${deliveryId}`,
      eventType: "consume",
      quantity: existing.included,
      metadata,
    });
  }
  if (existing.purchased > 0) {
    books.purchasedReserved -= existing.purchased;
    books.purchasedBalance = (books.purchasedBalance ?? 0) - existing.purchased;
    books.ledger.push({
      reason: "consume",
      delta: -existing.purchased,
      idempotencyKey: `sms:consume:delivery:${deliveryId}`,
      metadata,
    });
  }
  existing.state = "committed";
  return result(
    "committed",
    existing.requested,
    existing.included,
    existing.purchased,
  );
}

export function releaseApplicationSms(
  books: SmsCapacityBooks,
  deliveryId: string,
): SmsCapacityResult {
  const existing = books.allocations.get(deliveryId);
  if (!existing) return { ...result("released", 0), ok: true };
  if (existing.state === "released") {
    return result(
      "released",
      existing.requested,
      existing.included,
      existing.purchased,
      true,
    );
  }
  if (existing.state === "committed") {
    return {
      ...result(
        "committed",
        existing.requested,
        existing.included,
        existing.purchased,
        true,
      ),
      ok: true,
    };
  }

  const metadata = smsAllocationMetadata(
    books,
    deliveryId,
    existing.requested,
    existing.included,
    existing.purchased,
  );
  if (existing.included > 0) {
    books.includedReserved -= existing.included;
    books.usageEvents.push({
      usageKey: `sms:release:delivery:${deliveryId}:g:${existing.generation}`,
      eventType: "release",
      quantity: existing.included,
      metadata,
    });
  }
  if (existing.purchased > 0) {
    books.purchasedReserved -= existing.purchased;
    books.ledger.push({
      reason: "release_reserve",
      delta: 0,
      idempotencyKey: `sms:release:delivery:${deliveryId}:g:${existing.generation}`,
      metadata,
    });
  }
  existing.state = "released";
  existing.sendStarted = false;
  return result(
    "released",
    existing.requested,
    existing.included,
    existing.purchased,
  );
}

const lockTails = new Map<string, Promise<unknown>>();

/** In-memory stand-in for pg_advisory_xact_lock(organization). */
export function withSmsCapacityLock<T>(
  organizationId: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous = lockTails.get(organizationId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  lockTails.set(
    organizationId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
