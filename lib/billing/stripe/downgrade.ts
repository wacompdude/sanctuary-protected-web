/**
 * Schedule a lower plan at the next renewal through a Stripe Subscription Schedule.
 * The live subscription item stays the entitlement source until Stripe changes it.
 * Self-checks must not import downgrade-live.ts.
 */

import {
  commercialExpectationByInternalKey,
  commercialExpectationByLookupKey,
  type CommercialPriceExpectation,
} from "@/lib/billing/commercial-catalog";
import { BillingDowngradeError } from "@/lib/billing/errors";
import {
  matchStripePriceToExpectation,
  type ListPricesByLookupKey,
} from "@/lib/billing/stripe/catalog";
import type { GetStripePriceById } from "@/lib/billing/stripe/plan-correlation";
import { isPlanDowngrade, isPlanUpgrade } from "@/lib/subscriptions/status";
import {
  isPlanKey,
  PLAN_DISPLAY_NAMES,
  type PlanKey,
} from "@/lib/subscriptions/plan-keys";

export const DOWNGRADE_PRORATION_BEHAVIOR = "none" as const;
export const DOWNGRADE_END_BEHAVIOR = "release" as const;

export const DOWNGRADE_UPGRADE_CONFLICT_MESSAGE =
  "You currently have a plan downgrade scheduled. Cancel the scheduled downgrade before upgrading to another plan.";

export const DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE =
  "Cancel the scheduled plan downgrade before canceling the subscription.";

export const DOWNGRADE_ALREADY_CANCELLING_MESSAGE =
  "A subscription cancellation is already scheduled. Remove that cancellation before scheduling a plan downgrade.";

export const DOWNGRADE_NOT_CHANGED_MESSAGE =
  "The plan downgrade could not be scheduled. Your current plan was not changed.";

export const DOWNGRADE_CONFIGURATION_MESSAGE =
  "Scheduled downgrades are not available with the current billing configuration.";

const FORBIDDEN_CLIENT_FIELDS = [
  "price_id",
  "priceId",
  "subscription_id",
  "subscriptionId",
  "subscription_item_id",
  "subscriptionItemId",
  "customer_id",
  "customerId",
  "schedule_id",
  "scheduleId",
  "effective_at",
  "effectiveAt",
] as const;

const ELIGIBLE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type DowngradeSubscriptionItem = {
  id: string;
  priceId: string | null;
  lookupKey: string | null;
  quantity: number;
  recurring: boolean;
  periodStart: number | null;
  periodEnd: number | null;
};

export type RetrievedDowngradeSubscription = {
  id: string;
  customerId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  pendingUpdate: boolean;
  scheduleId: string | null;
  items: DowngradeSubscriptionItem[];
};

export type DowngradePhaseItem = {
  price: string;
  quantity: number;
};

export type DowngradeSchedulePhase = {
  items: DowngradePhaseItem[];
  start_date: number;
  end_date?: number;
  proration_behavior: typeof DOWNGRADE_PRORATION_BEHAVIOR;
};

export type DowngradeScheduleUpdate = {
  end_behavior: typeof DOWNGRADE_END_BEHAVIOR;
  proration_behavior: typeof DOWNGRADE_PRORATION_BEHAVIOR;
  phases: [DowngradeSchedulePhase, DowngradeSchedulePhase];
};

export type RetrievedDowngradeSchedule = {
  id: string;
  status: string;
  subscriptionId: string | null;
  phases: {
    startDate: number | null;
    endDate: number | null;
    items: { priceId: string | null; quantity: number }[];
  }[];
};

export type ScheduleInterpretation = "same" | "recoverable" | "conflict" | "inactive";

export type LocalDowngradeSubscription = {
  subscriptionRowId: string;
  planKey: string;
  billingProvider: string | null;
  billingCustomerId: string;
  billingSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
  activeDowngradeSchedule: boolean;
};

export type ScheduledDowngradeMirror = {
  providerScheduleId: string;
  scheduledPlanKey: PlanKey;
  scheduledEffectiveAt: string;
  scheduleStatus: "scheduled";
  requestedBy: string | null;
};

export type ReleasedDowngradeMirror = {
  providerScheduleId: string;
  scheduleStatus: "released";
  scheduleReleasedAt: string;
};

export type DowngradeStripeDeps = {
  retrieveSubscription: (
    subscriptionId: string,
  ) => Promise<RetrievedDowngradeSubscription>;
  listPrices: ListPricesByLookupKey;
  getPriceById?: GetStripePriceById;
  createScheduleFromSubscription: (
    subscriptionId: string,
    idempotencyKey: string,
  ) => Promise<{ id: string }>;
  retrieveSchedule: (scheduleId: string) => Promise<RetrievedDowngradeSchedule>;
  updateSchedule: (
    scheduleId: string,
    params: DowngradeScheduleUpdate,
    idempotencyKey: string,
  ) => Promise<{ id: string; subscriptionId: string | null }>;
  releaseSchedule: (
    scheduleId: string,
    idempotencyKey: string,
  ) => Promise<{ id: string; status: string }>;
  saveScheduledMirror: (input: ScheduledDowngradeMirror) => Promise<void>;
  saveReleasedMirror: (input: ReleasedDowngradeMirror) => Promise<void>;
};

export function assertClientDowngradePayload(
  fields: Record<string, unknown>,
): string {
  for (const key of FORBIDDEN_CLIENT_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) {
      throw new BillingDowngradeError(
        "Plan changes accept only the target plan. Stripe identifiers are resolved on the server.",
      );
    }
  }
  const target = typeof fields.plan_key === "string" ? fields.plan_key.trim() : "";
  if (!target) {
    throw new BillingDowngradeError("Choose a plan to schedule.");
  }
  return target;
}

/** Seat overage is a warning. It does not stop a future downgrade from being scheduled. */
export function downgradeMayBeScheduled(input: {
  isDowngrade: boolean;
  isSamePlan: boolean;
  isUpgrade: boolean;
  blocking: boolean;
}): boolean {
  void input.blocking;
  return input.isDowngrade && !input.isSamePlan && !input.isUpgrade;
}

export function downgradeIdempotencyKey(input: {
  subscriptionId: string;
  targetPlanKey: string;
  periodEnd: number;
}): string {
  return `downgrade_${input.subscriptionId}_${input.targetPlanKey}_${input.periodEnd}`;
}

/** Cleanup release after the scheduled target is already the live plan. */
export function postEffectiveReleaseIdempotencyKey(scheduleId: string): string {
  return `downgrade_release_effective_${scheduleId.trim()}`;
}

export type PostEffectiveReleaseInput = {
  now: Date;
  organizationId: string;
  livePlanKey: string;
  liveCustomerId: string;
  liveSubscriptionId: string;
  liveScheduleId: string | null;
  mirrorOrganizationId: string;
  mirrorCustomerId: string;
  mirrorSubscriptionId: string;
  scheduleStatus: string | null;
  providerScheduleId: string | null;
  scheduledPlanKey: string | null;
  scheduledEffectiveAt: string | null;
};

export type PostEffectiveReleaseDecision =
  | { eligible: false }
  | { eligible: true; scheduleId: string; idempotencyKey: string };

/**
 * Release only after the live subscription item is the scheduled target.
 * Future schedule phases are not an input.
 */
export function evaluatePostEffectiveScheduleRelease(
  input: PostEffectiveReleaseInput,
): PostEffectiveReleaseDecision {
  const scheduleId = (input.liveScheduleId ?? "").trim();
  const providerScheduleId = (input.providerScheduleId ?? "").trim();
  const mirrorCustomerId = input.mirrorCustomerId.trim();
  const mirrorSubscriptionId = input.mirrorSubscriptionId.trim();
  const effectiveMs = Date.parse(input.scheduledEffectiveAt ?? "");
  if ((input.scheduleStatus ?? "").trim() !== "scheduled") return { eligible: false };
  if (!scheduleId || scheduleId !== providerScheduleId) return { eligible: false };
  if (!input.organizationId || input.organizationId !== input.mirrorOrganizationId) {
    return { eligible: false };
  }
  if (!input.liveCustomerId || input.liveCustomerId !== mirrorCustomerId) {
    return { eligible: false };
  }
  if (!input.liveSubscriptionId || input.liveSubscriptionId !== mirrorSubscriptionId) {
    return { eligible: false };
  }
  if (!input.scheduledPlanKey || input.livePlanKey !== input.scheduledPlanKey) {
    return { eligible: false };
  }
  if (!Number.isFinite(effectiveMs) || input.now.getTime() < effectiveMs) {
    return { eligible: false };
  }
  return {
    eligible: true,
    scheduleId,
    idempotencyKey: postEffectiveReleaseIdempotencyKey(scheduleId),
  };
}

/**
 * Stripe's released status is not the local status.
 * completed: the target is already live. released: it never became live.
 */
export function scheduleMirrorStatusAfterStripeRelease(input: {
  livePlanKey: string | null;
  scheduledPlanKey: string | null;
  scheduledEffectiveAt: string | null;
  now: Date;
}): "completed" | "released" {
  const effectiveMs = Date.parse(input.scheduledEffectiveAt ?? "");
  if (
    input.livePlanKey &&
    input.scheduledPlanKey &&
    input.livePlanKey === input.scheduledPlanKey &&
    Number.isFinite(effectiveMs) &&
    input.now.getTime() >= effectiveMs
  ) {
    return "completed";
  }
  return "released";
}

export function downgradeFailureMessage(error: unknown): string {
  if (error instanceof BillingDowngradeError) return error.message;
  const record =
    error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : "";
  if (
    code === "more_permissions_needed" ||
    code === "api_key_expired" ||
    code === "secret_key_required"
  ) {
    return DOWNGRADE_CONFIGURATION_MESSAGE;
  }
  return DOWNGRADE_NOT_CHANGED_MESSAGE;
}

export function safeStripeDowngradeErrorLog(error: unknown): {
  operation: "subscription_downgrade_schedule";
  stripeErrorType: string | null;
  stripeErrorCode: string | null;
  httpStatus: number | null;
  stripeRequestId: string | null;
} {
  const record =
    error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return {
    operation: "subscription_downgrade_schedule",
    stripeErrorType: typeof record.type === "string" ? record.type : null,
    stripeErrorCode: typeof record.code === "string" ? record.code : null,
    httpStatus: typeof record.statusCode === "number" ? record.statusCode : null,
    stripeRequestId: typeof record.requestId === "string" ? record.requestId : null,
  };
}

export function assertDowngradeTarget(current: PlanKey, requested: string): PlanKey {
  const target = requested.trim();
  if (!isPlanKey(target)) {
    throw new BillingDowngradeError("Choose an approved subscription plan.");
  }
  if (target === current) {
    throw new BillingDowngradeError("You are already on this plan.");
  }
  if (!isPlanDowngrade(current, target) || isPlanUpgrade(current, target)) {
    throw new BillingDowngradeError(
      "Choose a lower plan. Higher plans use the immediate upgrade path.",
    );
  }
  return target;
}

export function assertCancellationAllowed(scheduleStatus: string | null | undefined): void {
  if ((scheduleStatus ?? "").trim() === "scheduled") {
    throw new BillingDowngradeError(DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE);
  }
}

type ClassifiedItem = {
  priceId: string;
  quantity: number;
  role: "base" | "addon";
};

export async function classifyDowngradeItems(input: {
  items: DowngradeSubscriptionItem[];
  getPriceById?: GetStripePriceById;
}): Promise<{ base: ClassifiedItem; addons: ClassifiedItem[] }> {
  const classified: ClassifiedItem[] = [];
  let base: ClassifiedItem | null = null;

  for (const item of input.items) {
    const priceId = (item.priceId ?? "").trim();
    if (!priceId) {
      throw new BillingDowngradeError(
        "A subscription item is missing its Stripe Price.",
      );
    }
    let lookup = (item.lookupKey ?? "").trim();
    if (!lookup && input.getPriceById) {
      const snapshot = await input.getPriceById(priceId);
      lookup = (snapshot?.lookupKey ?? "").trim();
    }
    const expectation = lookup ? commercialExpectationByLookupKey(lookup) : undefined;
    if (expectation?.kind === "sms_package" || !item.recurring) {
      continue;
    }
    if (expectation?.kind === "subscription") {
      if (base) {
        throw new BillingDowngradeError(
          "The subscription must have exactly one approved base plan.",
        );
      }
      base = { priceId, quantity: normalizeQuantity(item.quantity), role: "base" };
      continue;
    }
    classified.push({
      priceId,
      quantity: normalizeQuantity(item.quantity),
      role: "addon",
    });
  }

  if (!base) {
    throw new BillingDowngradeError(
      "The subscription must have exactly one approved base plan.",
    );
  }
  const addons = classified
    .filter((item) => item.role === "addon")
    .sort((a, b) => a.priceId.localeCompare(b.priceId));
  return { base, addons };
}

export function buildDowngradeScheduleUpdate(input: {
  currentBasePriceId: string;
  currentBaseQuantity: number;
  targetPriceId: string;
  addons: { priceId: string; quantity: number }[];
  periodStart: number;
  periodEnd: number;
}): DowngradeScheduleUpdate {
  if (!Number.isFinite(input.periodStart) || !Number.isFinite(input.periodEnd)) {
    throw new BillingDowngradeError("The live subscription is missing its renewal date.");
  }
  if (input.periodEnd <= input.periodStart) {
    throw new BillingDowngradeError("The live subscription renewal date is invalid.");
  }
  if (input.currentBasePriceId === input.targetPriceId) {
    throw new BillingDowngradeError("The selected plan matches the live base price.");
  }
  const currentItems = phaseItems(
    input.currentBasePriceId,
    input.currentBaseQuantity,
    input.addons,
  );
  const futureItems = phaseItems(
    input.targetPriceId,
    input.currentBaseQuantity,
    input.addons,
  );
  return {
    end_behavior: DOWNGRADE_END_BEHAVIOR,
    proration_behavior: DOWNGRADE_PRORATION_BEHAVIOR,
    phases: [
      {
        items: currentItems,
        start_date: input.periodStart,
        end_date: input.periodEnd,
        proration_behavior: DOWNGRADE_PRORATION_BEHAVIOR,
      },
      {
        items: futureItems,
        start_date: input.periodEnd,
        proration_behavior: DOWNGRADE_PRORATION_BEHAVIOR,
      },
    ],
  };
}

export function interpretExistingDowngradeSchedule(input: {
  scheduleStatus: string;
  phases: RetrievedDowngradeSchedule["phases"];
  currentPriceId: string;
  targetPriceId: string;
  periodEnd: number;
}): ScheduleInterpretation {
  const status = input.scheduleStatus.trim();
  if (status === "released" || status === "canceled" || status === "completed" || status === "aborted") {
    return "inactive";
  }
  const future = input.phases.find((phase) => phase.startDate === input.periodEnd);
  const current = input.phases.find((phase) => phase.endDate === input.periodEnd);
  const futureHasTarget = future
    ? phaseHasPrice(future.items, input.targetPriceId)
    : false;
  const futureHasCurrent = future
    ? phaseHasPrice(future.items, input.currentPriceId)
    : false;
  const currentHasCurrent = current
    ? phaseHasPrice(current.items, input.currentPriceId)
    : false;
  if (futureHasTarget && !futureHasCurrent && currentHasCurrent) return "same";
  if (!future && currentHasCurrent) return "recoverable";
  return "conflict";
}

export async function scheduleSubscriptionDowngrade(input: {
  local: LocalDowngradeSubscription;
  targetPlanKey: string;
  requestedBy: string | null;
  deps: DowngradeStripeDeps;
}): Promise<ScheduledDowngradeMirror> {
  const local = assertLocalSubscription(input.local);
  if (local.cancelAtPeriodEnd) {
    throw new BillingDowngradeError(DOWNGRADE_ALREADY_CANCELLING_MESSAGE);
  }
  const stripeSubscription = await input.deps.retrieveSubscription(
    local.billingSubscriptionId,
  );
  assertLiveSubscription(local, stripeSubscription);
  if (stripeSubscription.cancelAtPeriodEnd) {
    throw new BillingDowngradeError(DOWNGRADE_ALREADY_CANCELLING_MESSAGE);
  }
  if (stripeSubscription.pendingUpdate) {
    throw new BillingDowngradeError(
      "This subscription has an unfinished payment update. Wait until it completes before scheduling a downgrade.",
    );
  }

  const classified = await classifyDowngradeItems({
    items: stripeSubscription.items,
    getPriceById: input.deps.getPriceById,
  });
  const baseItem = stripeSubscription.items.find(
    (item) => item.priceId === classified.base.priceId,
  );
  if (!baseItem || baseItem.periodStart == null || baseItem.periodEnd == null) {
    throw new BillingDowngradeError("The live subscription is missing its renewal date.");
  }
  const currentPlanKey = assertCurrentPlan(local.planKey);
  const expectedLookup = commercialExpectationByInternalKey(currentPlanKey)?.lookupKey;
  const baseLookup = (baseItem.lookupKey ?? "").trim();
  if (expectedLookup && baseLookup && baseLookup !== expectedLookup) {
    throw new BillingDowngradeError(
      "The plan on file does not match the live Stripe subscription. Refresh billing and try again.",
    );
  }
  const targetPlanKey = assertDowngradeTarget(currentPlanKey, input.targetPlanKey);
  const targetPriceId = await resolveTargetPriceId(
    targetPlanKey,
    input.deps.listPrices,
  );
  const update = buildDowngradeScheduleUpdate({
    currentBasePriceId: classified.base.priceId,
    currentBaseQuantity: classified.base.quantity,
    targetPriceId,
    addons: classified.addons,
    periodStart: baseItem.periodStart,
    periodEnd: baseItem.periodEnd,
  });
  const idempotencyKey = downgradeIdempotencyKey({
    subscriptionId: local.billingSubscriptionId,
    targetPlanKey,
    periodEnd: baseItem.periodEnd,
  });

  let scheduleId = (stripeSubscription.scheduleId ?? "").trim();
  if (scheduleId) {
    const existing = await input.deps.retrieveSchedule(scheduleId);
    const interpretation = interpretExistingDowngradeSchedule({
      scheduleStatus: existing.status,
      phases: existing.phases,
      currentPriceId: classified.base.priceId,
      targetPriceId,
      periodEnd: baseItem.periodEnd,
    });
    if (interpretation === "conflict") {
      throw new BillingDowngradeError(
        "A different plan downgrade is already scheduled. Cancel it before choosing another plan.",
      );
    }
    if (interpretation === "inactive") {
      scheduleId = "";
    }
  }

  if (!scheduleId) {
    try {
      const created = await input.deps.createScheduleFromSubscription(
        local.billingSubscriptionId,
        idempotencyKey,
      );
      scheduleId = created.id.trim();
    } catch (error) {
      const recovered = await recoverScheduleId(
        input.deps,
        local.billingSubscriptionId,
      );
      if (!recovered) {
        throw new BillingDowngradeError(downgradeFailureMessage(error));
      }
      scheduleId = recovered;
    }
  }

  const beforeUpdate = await input.deps.retrieveSchedule(scheduleId);
  const interpretation = interpretExistingDowngradeSchedule({
    scheduleStatus: beforeUpdate.status,
    phases: beforeUpdate.phases,
    currentPriceId: classified.base.priceId,
    targetPriceId,
    periodEnd: baseItem.periodEnd,
  });
  if (interpretation === "conflict") {
    throw new BillingDowngradeError(
      "A different plan downgrade is already scheduled. Cancel it before choosing another plan.",
    );
  }
  if (interpretation !== "same") {
    try {
      const updated = await input.deps.updateSchedule(
        scheduleId,
        update,
        `${idempotencyKey}_phases`,
      );
      if (updated.subscriptionId && updated.subscriptionId !== local.billingSubscriptionId) {
        throw new BillingDowngradeError(DOWNGRADE_NOT_CHANGED_MESSAGE);
      }
    } catch (error) {
      if (error instanceof BillingDowngradeError) throw error;
      throw new BillingDowngradeError(downgradeFailureMessage(error));
    }
  }

  const confirmed = await input.deps.retrieveSchedule(scheduleId);
  const confirmedInterpretation = interpretExistingDowngradeSchedule({
    scheduleStatus: confirmed.status,
    phases: confirmed.phases,
    currentPriceId: classified.base.priceId,
    targetPriceId,
    periodEnd: baseItem.periodEnd,
  });
  if (confirmedInterpretation !== "same") {
    throw new BillingDowngradeError(DOWNGRADE_NOT_CHANGED_MESSAGE);
  }

  const mirror: ScheduledDowngradeMirror = {
    providerScheduleId: scheduleId,
    scheduledPlanKey: targetPlanKey,
    scheduledEffectiveAt: new Date(baseItem.periodEnd * 1000).toISOString(),
    scheduleStatus: "scheduled",
    requestedBy: input.requestedBy,
  };
  await input.deps.saveScheduledMirror(mirror);
  return mirror;
}

export async function releaseScheduledDowngrade(input: {
  local: LocalDowngradeSubscription;
  deps: DowngradeStripeDeps;
}): Promise<ReleasedDowngradeMirror> {
  const local = assertLocalSubscription(input.local);
  const stripeSubscription = await input.deps.retrieveSubscription(
    local.billingSubscriptionId,
  );
  assertLiveSubscription(local, stripeSubscription);
  const scheduleId = (stripeSubscription.scheduleId ?? "").trim();
  if (!scheduleId) {
    if (local.activeDowngradeSchedule) {
      throw new BillingDowngradeError(
        "The scheduled downgrade could not be found on the live subscription.",
      );
    }
    return {
      providerScheduleId: "",
      scheduleStatus: "released",
      scheduleReleasedAt: new Date().toISOString(),
    };
  }

  const schedule = await input.deps.retrieveSchedule(scheduleId);
  const classified = await classifyDowngradeItems({
    items: stripeSubscription.items,
    getPriceById: input.deps.getPriceById,
  });
  const liveStillCurrent = stripeSubscription.items.some(
    (item) => item.priceId === classified.base.priceId,
  );
  if (!liveStillCurrent) {
    throw new BillingDowngradeError(
      "The scheduled downgrade has already taken effect.",
    );
  }
  if (schedule.status === "released" || schedule.status === "canceled" || schedule.status === "completed") {
    const mirror: ReleasedDowngradeMirror = {
      providerScheduleId: scheduleId,
      scheduleStatus: "released",
      scheduleReleasedAt: new Date().toISOString(),
    };
    await input.deps.saveReleasedMirror(mirror);
    return mirror;
  }

  try {
    const released = await input.deps.releaseSchedule(
      scheduleId,
      `downgrade_release_${scheduleId}`,
    );
    if (released.status && released.status !== "released" && released.status !== "canceled") {
      const again = await input.deps.retrieveSchedule(scheduleId);
      if (again.status !== "released") {
        throw new BillingDowngradeError(
          "The scheduled downgrade could not be canceled. Your current plan was not changed.",
        );
      }
    }
  } catch (error) {
    if (error instanceof BillingDowngradeError) throw error;
    const again = await input.deps.retrieveSchedule(scheduleId).catch(() => null);
    if (!again || again.status !== "released") {
      throw new BillingDowngradeError(downgradeFailureMessage(error));
    }
  }

  const after = await input.deps.retrieveSubscription(local.billingSubscriptionId);
  if (after.id !== local.billingSubscriptionId) {
    throw new BillingDowngradeError(
      "The scheduled downgrade could not be canceled. Your current plan was not changed.",
    );
  }
  const mirror: ReleasedDowngradeMirror = {
    providerScheduleId: scheduleId,
    scheduleStatus: "released",
    scheduleReleasedAt: new Date().toISOString(),
  };
  await input.deps.saveReleasedMirror(mirror);
  return mirror;
}

export function scheduledDowngradeDisplay(input: {
  currentPlanKey: PlanKey;
  targetPlanKey: PlanKey;
  effectiveAt: string;
}): {
  currentPlanName: string;
  targetPlanName: string;
  effectiveAt: string;
} {
  return {
    currentPlanName: PLAN_DISPLAY_NAMES[input.currentPlanKey],
    targetPlanName: PLAN_DISPLAY_NAMES[input.targetPlanKey],
    effectiveAt: input.effectiveAt,
  };
}

function phaseItems(
  basePriceId: string,
  baseQuantity: number,
  addons: { priceId: string; quantity: number }[],
): DowngradePhaseItem[] {
  return [
    { price: basePriceId, quantity: normalizeQuantity(baseQuantity) },
    ...addons.map((addon) => ({ price: addon.priceId, quantity: addon.quantity })),
  ];
}

function phaseHasPrice(
  items: { priceId: string | null }[],
  priceId: string,
): boolean {
  return items.some((item) => item.priceId === priceId);
}

function normalizeQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) return 1;
  return quantity;
}

function assertLocalSubscription(
  local: LocalDowngradeSubscription,
): LocalDowngradeSubscription & {
  billingCustomerId: string;
  billingSubscriptionId: string;
} {
  const provider = (local.billingProvider ?? "").trim().toLowerCase();
  if (provider !== "stripe") {
    throw new BillingDowngradeError("This organization is not billed through Stripe.");
  }
  const billingSubscriptionId = local.billingSubscriptionId.trim();
  const billingCustomerId = local.billingCustomerId.trim();
  if (!billingSubscriptionId || !billingCustomerId) {
    throw new BillingDowngradeError(
      "A connected Stripe subscription is required before a downgrade can be scheduled.",
    );
  }
  return { ...local, billingSubscriptionId, billingCustomerId };
}

function assertLiveSubscription(
  local: LocalDowngradeSubscription,
  stripeSubscription: RetrievedDowngradeSubscription,
): void {
  if (stripeSubscription.id !== local.billingSubscriptionId.trim()) {
    throw new BillingDowngradeError("The live subscription does not match this organization.");
  }
  if (stripeSubscription.customerId !== local.billingCustomerId.trim()) {
    throw new BillingDowngradeError(
      "The live subscription does not belong to this organization's Stripe customer.",
    );
  }
  if (!ELIGIBLE_STATUSES.has(stripeSubscription.status)) {
    throw new BillingDowngradeError(
      "This subscription cannot be changed in its current status.",
    );
  }
}

function assertCurrentPlan(planKey: string): PlanKey {
  if (!isPlanKey(planKey)) {
    throw new BillingDowngradeError("The current plan could not be verified.");
  }
  const expectation = commercialExpectationByLookupKey(
    commercialExpectationByInternalKey(planKey)?.lookupKey ?? "",
  );
  if (!expectation || expectation.kind !== "subscription") {
    throw new BillingDowngradeError("The current plan could not be verified.");
  }
  return planKey;
}

async function resolveTargetPriceId(
  targetPlanKey: PlanKey,
  listPrices: ListPricesByLookupKey,
): Promise<string> {
  const expectation = subscriptionExpectation(targetPlanKey);
  const prices = await listPrices(expectation.lookupKey);
  try {
    const resolved = matchStripePriceToExpectation(prices, expectation);
    if (resolved.internalKey !== targetPlanKey) {
      throw new BillingDowngradeError(
        "The selected plan is not an approved live subscription price.",
      );
    }
    return resolved.stripePriceId;
  } catch (error) {
    if (error instanceof BillingDowngradeError) throw error;
    throw new BillingDowngradeError(
      "The selected plan is not an approved live subscription price.",
    );
  }
}

function subscriptionExpectation(planKey: PlanKey): CommercialPriceExpectation {
  const expectation = commercialExpectationByInternalKey(planKey);
  if (!expectation || expectation.kind !== "subscription") {
    throw new BillingDowngradeError("Choose an approved subscription plan.");
  }
  return expectation;
}

async function recoverScheduleId(
  deps: DowngradeStripeDeps,
  subscriptionId: string,
): Promise<string | null> {
  try {
    const subscription = await deps.retrieveSubscription(subscriptionId);
    const scheduleId = (subscription.scheduleId ?? "").trim();
    return scheduleId || null;
  } catch {
    return null;
  }
}
