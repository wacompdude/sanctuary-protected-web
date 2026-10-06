/**
 * Receive a provider webhook with signature verification (provider-specific)
 * and idempotent persistence + Stripe synchronization in billing_events.
 *
 * Claim model (billing_events unique on provider + provider_event_id):
 * - processed / ignored → 200 duplicate (no re-handler)
 * - received (fresh) → 200 duplicate (in-flight owner)
 * - received (stale) / failed → optimistic retry_count claim, then re-dispatch
 * - insert race (23505) → re-read status; never blindly reprocess
 */

import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize";
import { getBillingProvider } from "@/lib/billing/provider";
import type { BillingWebhookReceiveResult } from "@/lib/billing/types";
import { BillingConfigurationError } from "@/lib/billing/errors";
import { createStripePriceByIdRetriever } from "@/lib/billing/stripe/catalog-stripe";
import { readStripeSecretKey } from "@/lib/billing/stripe/config";
import { dispatchStripeWebhookEvent } from "@/lib/billing/stripe/webhook-dispatch";
import { createAdminWebhookSyncStore } from "@/lib/billing/stripe/webhook-store";
import type { GetStripePriceById } from "@/lib/billing/stripe/plan-correlation";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import type { WebhookSyncStore } from "@/lib/billing/stripe/webhook-sync";

/** Fresh "received" rows are treated as in-flight; older ones may be reclaimed. */
export const BILLING_EVENT_STALE_RECEIVED_MS = 2 * 60 * 1000;

function isStripeObjectSummary(value: unknown): value is StripeWebhookObjectSummary {
  return Boolean(value && typeof value === "object" && "objectType" in value);
}

export type BillingEventClaimRecord = {
  id: string;
  processingStatus: string;
  createdAt: string | null;
  retryCount: number;
};

export type BillingEventClaimStore = {
  findByProviderEventId(input: {
    billingProvider: string;
    providerEventId: string;
  }): Promise<BillingEventClaimRecord | null>;
  insertReceived(input: {
    organizationId: string | null;
    billingProvider: string;
    providerEventId: string | null;
    eventType: string;
    metadata: Record<string, unknown>;
  }): Promise<
    | { kind: "inserted"; id: string }
    | { kind: "duplicate" }
  >;
  /**
   * Optimistic claim: only one concurrent worker should win.
   * Transitions failed/stale-received → received and bumps retry_count.
   */
  tryClaimForRetry(input: {
    id: string;
    expectedRetryCount: number;
    fromStatus: "failed" | "received";
  }): Promise<"claimed" | "lost">;
  finalize(input: {
    id: string;
    organizationId: string | null;
    processingStatus: "processed" | "ignored" | "failed";
    detail: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
};

export type ProcessBillingWebhookDeps = {
  getProvider?: typeof getBillingProvider;
  isServiceRoleConfigured?: () => boolean;
  createClaimStore?: () => BillingEventClaimStore;
  createSyncStore?: () => WebhookSyncStore;
  getPriceById?: GetStripePriceById;
  /** Injectable clock for stale-received tests. */
  nowMs?: () => number;
};

function createAdminBillingEventClaimStore(): BillingEventClaimStore {
  const admin = createAdminClient();
  return {
    async findByProviderEventId(input) {
      const { data } = await admin
        .from("billing_events")
        .select("id, processing_status, created_at, retry_count")
        .eq("billing_provider", input.billingProvider)
        .eq("provider_event_id", input.providerEventId)
        .maybeSingle();
      if (!data) return null;
      return {
        id: String(data.id),
        processingStatus: String(data.processing_status ?? ""),
        createdAt:
          typeof data.created_at === "string" ? data.created_at : null,
        retryCount: Number(data.retry_count ?? 0),
      };
    },
    async insertReceived(input) {
      const { data, error } = await admin
        .from("billing_events")
        .insert({
          organization_id: input.organizationId,
          billing_provider: input.billingProvider || "unknown",
          provider_event_id: input.providerEventId,
          event_type: input.eventType,
          processing_status: "received",
          metadata: input.metadata,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") return { kind: "duplicate" };
        throw new Error(error.message);
      }
      return { kind: "inserted", id: String(data.id) };
    },
    async tryClaimForRetry(input) {
      const { data, error } = await admin
        .from("billing_events")
        .update({
          processing_status: "received",
          error_message: null,
          safe_error_summary: null,
          retry_count: input.expectedRetryCount + 1,
        })
        .eq("id", input.id)
        .eq("processing_status", input.fromStatus)
        .eq("retry_count", input.expectedRetryCount)
        .select("id")
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return data?.id ? "claimed" : "lost";
    },
    async finalize(input) {
      await admin
        .from("billing_events")
        .update({
          organization_id: input.organizationId,
          processing_status: input.processingStatus,
          processed_at: new Date().toISOString(),
          error_message:
            input.processingStatus === "failed" ? input.detail : null,
          safe_error_summary: input.detail?.slice(0, 240) ?? null,
          metadata: input.metadata,
        })
        .eq("id", input.id);
    },
  };
}

function isStaleReceived(
  record: BillingEventClaimRecord,
  nowMs: number,
): boolean {
  if (record.processingStatus !== "received") return false;
  if (!record.createdAt) return false;
  const created = Date.parse(record.createdAt);
  if (!Number.isFinite(created)) return false;
  return nowMs - created >= BILLING_EVENT_STALE_RECEIVED_MS;
}

export async function processBillingWebhook(
  input: {
    providerSlug: string;
    rawBody: string;
    headers: Headers;
  },
  deps: ProcessBillingWebhookDeps = {},
): Promise<BillingWebhookReceiveResult> {
  const serviceRoleOk = (deps.isServiceRoleConfigured ?? isServiceRoleConfigured)();
  if (!serviceRoleOk) {
    return {
      ok: false,
      status: 503,
      error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for billing webhooks.",
    };
  }

  const provider = (deps.getProvider ?? getBillingProvider)();
  if (
    provider.id !== "none" &&
    input.providerSlug.trim().toLowerCase() !== provider.id
  ) {
    return {
      ok: false,
      status: 400,
      error: `Webhook provider "${input.providerSlug}" does not match configured provider.`,
    };
  }

  let parsed: Awaited<ReturnType<typeof provider.verifyAndParseWebhook>>;
  try {
    parsed = await provider.verifyAndParseWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
    });
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return { ok: false, status: 503, error: error.message };
    }
    return {
      ok: false,
      status: 500,
      error: "Webhook verification failed.",
    };
  }

  if (!parsed.ok) {
    return {
      ok: false,
      status: parsed.status,
      error: parsed.error ?? "Webhook rejected.",
    };
  }

  const claimStore =
    deps.createClaimStore?.() ?? createAdminBillingEventClaimStore();
  const billingProvider =
    provider.id === "none"
      ? input.providerSlug.trim().toLowerCase()
      : provider.id;
  const providerEventId = parsed.providerEventId?.trim() || null;
  const metadata = sanitizeAuditMetadata(parsed.metadata ?? {});
  const nowMs = (deps.nowMs ?? Date.now)();

  let eventRowId: string | null = null;

  if (providerEventId) {
    const existing = await claimStore.findByProviderEventId({
      billingProvider,
      providerEventId,
    });

    if (existing) {
      const status = existing.processingStatus;
      if (status === "processed" || status === "ignored") {
        return {
          ok: true,
          status: 200,
          duplicate: true,
          eventId: existing.id,
          normalizedType: parsed.eventType,
        };
      }

      if (status === "received" && !isStaleReceived(existing, nowMs)) {
        // Another worker owns a fresh claim — do not re-enter handlers.
        return {
          ok: true,
          status: 200,
          duplicate: true,
          eventId: existing.id,
          normalizedType: parsed.eventType,
        };
      }

      if (status === "failed" || isStaleReceived(existing, nowMs)) {
        const claim = await claimStore.tryClaimForRetry({
          id: existing.id,
          expectedRetryCount: existing.retryCount,
          fromStatus: status === "failed" ? "failed" : "received",
        });
        if (claim === "lost") {
          return {
            ok: true,
            status: 200,
            duplicate: true,
            eventId: existing.id,
            normalizedType: parsed.eventType,
          };
        }
        eventRowId = existing.id;
      } else {
        return {
          ok: true,
          status: 200,
          duplicate: true,
          eventId: existing.id,
          normalizedType: parsed.eventType,
        };
      }
    }
  }

  if (!eventRowId) {
    try {
      const inserted = await claimStore.insertReceived({
        organizationId: parsed.organizationId ?? null,
        billingProvider,
        providerEventId,
        eventType: parsed.eventType,
        metadata,
      });
      if (inserted.kind === "duplicate") {
        // Concurrent insert lost the race — re-read and follow claim rules.
        if (providerEventId) {
          const raced = await claimStore.findByProviderEventId({
            billingProvider,
            providerEventId,
          });
          if (raced) {
            const status = raced.processingStatus;
            if (
              status === "processed" ||
              status === "ignored" ||
              (status === "received" && !isStaleReceived(raced, nowMs))
            ) {
              return {
                ok: true,
                status: 200,
                duplicate: true,
                eventId: raced.id,
                normalizedType: parsed.eventType,
              };
            }
            if (status === "failed" || isStaleReceived(raced, nowMs)) {
              const claim = await claimStore.tryClaimForRetry({
                id: raced.id,
                expectedRetryCount: raced.retryCount,
                fromStatus: status === "failed" ? "failed" : "received",
              });
              if (claim === "lost") {
                return {
                  ok: true,
                  status: 200,
                  duplicate: true,
                  eventId: raced.id,
                  normalizedType: parsed.eventType,
                };
              }
              eventRowId = raced.id;
            }
          }
        }
        if (!eventRowId) {
          return {
            ok: true,
            status: 200,
            duplicate: true,
            eventId: null,
            normalizedType: parsed.eventType,
          };
        }
      } else {
        eventRowId = inserted.id;
      }
    } catch (error) {
      console.error(
        "billing webhook insert failed:",
        error instanceof Error ? error.message.slice(0, 120) : "unknown",
      );
      return {
        ok: false,
        status: 500,
        error: "Unable to persist billing event.",
      };
    }
  }

  const getPriceById =
    deps.getPriceById ??
    (provider.id === "stripe"
      ? createStripePriceByIdRetriever(readStripeSecretKey())
      : undefined);

  return finalizeStripeOrGeneric({
    claimStore,
    createSyncStore: deps.createSyncStore,
    getPriceById,
    providerId: provider.id,
    providerEventId,
    eventRowId,
    parsed,
    metadata,
  });
}

async function finalizeStripeOrGeneric(input: {
  claimStore: BillingEventClaimStore;
  createSyncStore?: () => WebhookSyncStore;
  getPriceById?: GetStripePriceById;
  providerId: string;
  providerEventId: string | null;
  eventRowId: string;
  parsed: {
    eventType: string;
    organizationId?: string | null;
    metadata?: Record<string, unknown>;
  };
  metadata: Record<string, unknown>;
}): Promise<BillingWebhookReceiveResult> {
  if (input.providerId !== "stripe") {
    await input.claimStore.finalize({
      id: input.eventRowId,
      organizationId: input.parsed.organizationId ?? null,
      processingStatus: "ignored",
      detail:
        "No provider handler installed; event stored for idempotency only.",
      metadata: input.metadata,
    });

    return {
      ok: true,
      status: 200,
      duplicate: false,
      eventId: input.eventRowId,
      normalizedType: input.parsed.eventType,
    };
  }

  const object = input.parsed.metadata?.stripe_object;
  if (!isStripeObjectSummary(object)) {
    await input.claimStore.finalize({
      id: input.eventRowId,
      organizationId: input.parsed.organizationId ?? null,
      processingStatus: "failed",
      detail: "Verified Stripe event missing sanitized object summary.",
      metadata: input.metadata,
    });
    return {
      ok: false,
      status: 500,
      error: "Verified Stripe event missing handler context.",
    };
  }

  try {
    const store =
      input.createSyncStore?.() ?? createAdminWebhookSyncStore();
    const result = await dispatchStripeWebhookEvent({
      eventType: input.parsed.eventType,
      object,
      store,
      providerEventId: input.providerEventId,
      getPriceById: input.getPriceById,
    });

    const mergedMetadata = sanitizeAuditMetadata({
      ...input.metadata,
      handler: result.metadata,
      handler_detail: result.detail,
    });

    await input.claimStore.finalize({
      id: input.eventRowId,
      organizationId: result.organizationId,
      processingStatus: result.outcome === "processed" ? "processed" : "ignored",
      detail: result.detail,
      metadata: mergedMetadata,
    });

    return {
      ok: true,
      status: 200,
      duplicate: false,
      eventId: input.eventRowId,
      normalizedType: input.parsed.eventType,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 240) : "handler_failed";
    console.error("stripe webhook handler failed:", message);
    await input.claimStore.finalize({
      id: input.eventRowId,
      organizationId: input.parsed.organizationId ?? null,
      processingStatus: "failed",
      detail: message,
      metadata: input.metadata,
    });

    return {
      ok: false,
      status: 500,
      error: "Webhook handler failed; Stripe may retry.",
    };
  }
}
