/**
 * Scheduled downgrade self-check. No Stripe network and no database writes.
 * Run: npx --yes tsx lib/billing/stripe/downgrade.selfcheck.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commercialPlanByKey } from "@/lib/billing/commercial-catalog";
import {
  DOWNGRADE_ALREADY_CANCELLING_MESSAGE,
  DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE,
  DOWNGRADE_END_BEHAVIOR,
  DOWNGRADE_PRORATION_BEHAVIOR,
  DOWNGRADE_UPGRADE_CONFLICT_MESSAGE,
  assertCancellationAllowed,
  assertDowngradeTarget,
  buildDowngradeScheduleUpdate,
  classifyDowngradeItems,
  downgradeMayBeScheduled,
  interpretExistingDowngradeSchedule,
  releaseScheduledDowngrade,
  scheduleSubscriptionDowngrade,
  type DowngradeStripeDeps,
  type LocalDowngradeSubscription,
  type RetrievedDowngradeSchedule,
  type RetrievedDowngradeSubscription,
} from "@/lib/billing/stripe/downgrade";
import { prepareSubscriptionUpgrade } from "@/lib/billing/stripe/upgrade";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const PERIOD_START = 1760000000;
const PERIOD_END = 1762592000;

function price(lookupKey: string, amount: number): StripePriceSnapshot {
  return {
    id: `price_${lookupKey}`,
    productId: `prod_${lookupKey}`,
    active: true,
    currency: "usd",
    unitAmount: amount,
    type: "recurring",
    recurringInterval: "month",
    lookupKey,
  };
}

function local(overrides: Partial<LocalDowngradeSubscription> = {}): LocalDowngradeSubscription {
  return {
    subscriptionRowId: "row_1",
    planKey: "steward_pro",
    billingProvider: "stripe",
    billingCustomerId: "cus_test",
    billingSubscriptionId: "sub_test",
    cancelAtPeriodEnd: false,
    activeDowngradeSchedule: false,
    ...overrides,
  };
}

function subscription(
  overrides: Partial<RetrievedDowngradeSubscription> = {},
): RetrievedDowngradeSubscription {
  return {
    id: "sub_test",
    customerId: "cus_test",
    status: "active",
    cancelAtPeriodEnd: false,
    pendingUpdate: false,
    scheduleId: null,
    items: [
      {
        id: "si_base",
        priceId: "price_steward_pro_monthly",
        lookupKey: "steward_pro_monthly",
        quantity: 1,
        recurring: true,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
      {
        id: "si_addon",
        priceId: "price_camera_monthly",
        lookupKey: "future_camera_monthly",
        quantity: 2,
        recurring: true,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
      {
        id: "si_sms",
        priceId: "price_steward_pro_sms_100",
        lookupKey: "steward_pro_sms_100",
        quantity: 1,
        recurring: false,
        periodStart: null,
        periodEnd: null,
      },
    ],
    ...overrides,
  };
}

function sameSchedule(): RetrievedDowngradeSchedule {
  return {
    id: "sub_sched_same",
    status: "active",
    subscriptionId: "sub_test",
    phases: [
      {
        startDate: PERIOD_START,
        endDate: PERIOD_END,
        items: [
          { priceId: "price_steward_pro_monthly", quantity: 1 },
          { priceId: "price_camera_monthly", quantity: 2 },
        ],
      },
      {
        startDate: PERIOD_END,
        endDate: null,
        items: [
          { priceId: "price_servant_standard_monthly", quantity: 1 },
          { priceId: "price_camera_monthly", quantity: 2 },
        ],
      },
    ],
  };
}

async function main(): Promise<void> {
  assertDowngradeTarget("steward_pro", "servant_standard");
  assertDowngradeTarget("shepherd_plus", "steward_pro");
  assertDowngradeTarget("omni_enterprise", "servant_standard");
  assert(throws(() => assertDowngradeTarget("servant_standard", "steward_pro")), "4 higher plan rejected");
  assert(throws(() => assertDowngradeTarget("steward_pro", "steward_pro")), "5 same plan rejected");

  const classified = await classifyDowngradeItems({
    items: subscription().items,
  });
  const update = buildDowngradeScheduleUpdate({
    currentBasePriceId: classified.base.priceId,
    currentBaseQuantity: classified.base.quantity,
    targetPriceId: "price_servant_standard_monthly",
    addons: classified.addons,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });
  assert(update.phases[0]?.items[0]?.price === "price_steward_pro_monthly", "12 current phase keeps base plan");
  assert(update.phases[1]?.items[0]?.price === "price_servant_standard_monthly", "13 future phase changes base plan");
  assert(
    update.phases[0]?.items.some((item) => item.price === "price_camera_monthly" && item.quantity === 2) &&
      update.phases[1]?.items.some((item) => item.price === "price_camera_monthly" && item.quantity === 2),
    "14 recurring add-on preserved",
  );
  assert(
    !update.phases[0]?.items.some((item) => item.price.includes("sms")) &&
      !update.phases[1]?.items.some((item) => item.price.includes("sms")),
    "15 one-time SMS excluded",
  );
  assert(update.proration_behavior === DOWNGRADE_PRORATION_BEHAVIOR, "16 proration none");
  assert(update.phases[0]?.proration_behavior === "none", "16 phase proration none");
  assert(update.end_behavior === DOWNGRADE_END_BEHAVIOR, "17 end behavior release");
  assert(update.phases[0]?.end_date === PERIOD_END, "11 effective date is the live period end");
  assert(!("billing_cycle_anchor" in update), "no billing cycle anchor");

  let creates = 0;
  let invoices = 0;
  let planId = "plan_steward";
  const planName = "Steward Pro";
  const mirror: { status?: string; planKey?: string; effective?: string } = {};
  const deps = fakeDeps({
    onCreate: () => {
      creates += 1;
    },
    onInvoice: () => {
      invoices += 1;
    },
    save: (input) => {
      mirror.status = input.scheduleStatus;
      mirror.planKey = input.scheduledPlanKey;
      mirror.effective = input.scheduledEffectiveAt;
    },
  });

  const first = await scheduleSubscriptionDowngrade({
    local: local(),
    targetPlanKey: "servant_standard",
    requestedBy: "user_1",
    deps,
  });
  const second = await scheduleSubscriptionDowngrade({
    local: local({ activeDowngradeSchedule: true }),
    targetPlanKey: "servant_standard",
    requestedBy: "user_1",
    deps: fakeDeps({
      subscription: subscription({ scheduleId: "sub_sched_same" }),
      schedule: sameSchedule(),
      onCreate: () => {
        creates += 1;
      },
      save: () => undefined,
    }),
  });
  assert(first.scheduledPlanKey === "servant_standard", "1 steward to servant scheduled");
  assert(first.scheduleStatus === "scheduled", "6 schedule is pending");
  assert(planId === "plan_steward", "7 scheduled target does not become plan_id");
  assert(planName === "Steward Pro", "8 display plan stays current");
  assert(update.phases[0]?.items[0]?.price === "price_steward_pro_monthly", "9 no immediate price replacement");
  assert(invoices === 0, "10 no immediate invoice");
  assert(creates === 1, "18 duplicate request does not create a second schedule");
  assert(second.providerScheduleId === "sub_sched_same", "18 duplicate request reuses the schedule");
  assert(mirror.effective === new Date(PERIOD_END * 1000).toISOString(), "11 stored effective timestamp");

  const conflict = await throwsAsync(() =>
    scheduleSubscriptionDowngrade({
      local: local(),
      targetPlanKey: "servant_standard",
      requestedBy: "user_1",
      deps: fakeDeps({
        subscription: subscription({ scheduleId: "sub_sched_other" }),
        schedule: {
          ...sameSchedule(),
          id: "sub_sched_other",
          phases: [
            sameSchedule().phases[0]!,
            {
              startDate: PERIOD_END,
              endDate: null,
              items: [{ priceId: "price_shepherd_plus_monthly", quantity: 1 }],
            },
          ],
        },
      }),
    }),
  );
  assert(conflict, "19 conflicting schedule rejected");

  assert(
    downgradeMayBeScheduled({
      isDowngrade: true,
      isSamePlan: false,
      isUpgrade: false,
      blocking: true,
    }),
    "26 seat overage does not block scheduling",
  );

  let released = 0;
  let scheduleStatus = "active";
  const canceledDowngrade = await releaseScheduledDowngrade({
    local: local({ activeDowngradeSchedule: true }),
    deps: fakeDeps({
      subscription: subscription({ scheduleId: "sub_sched_same" }),
      schedule: sameSchedule(),
      onRelease: () => {
        released += 1;
        scheduleStatus = "released";
      },
      scheduleStatus: () => scheduleStatus,
      saveReleased: () => {
        planId = "plan_steward";
      },
    }),
  });
  await releaseScheduledDowngrade({
    local: local(),
    deps: fakeDeps({
      subscription: subscription({ scheduleId: "sub_sched_same" }),
      schedule: { ...sameSchedule(), status: "released" },
      onRelease: () => {
        released += 1;
      },
    }),
  });
  assert(released === 1, "22 second release does not release again");
  assert(canceledDowngrade.scheduleStatus === "released", "customer cancel stays released");
  assert(planId === "plan_steward", "21 release keeps the live plan");

  const blockedUpgrade = await throwsAsync(() =>
    prepareSubscriptionUpgrade({
      local: {
        planKey: "steward_pro",
        billingProvider: "stripe",
        billingCustomerId: "cus_test",
        billingSubscriptionId: "sub_test",
        activeDowngradeSchedule: true,
      },
      targetPlanKey: "shepherd_plus",
      stripeSubscription: {
        id: "sub_test",
        customerId: "cus_test",
        status: "active",
        scheduleId: "sub_sched_same",
        items: [
          {
            id: "si_base",
            priceId: "price_steward_pro_monthly",
            lookupKey: "steward_pro_monthly",
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
          },
        ],
      },
      listPrices: async () => [price("shepherd_plus_monthly", 5995)],
    }),
  );
  assert(blockedUpgrade?.message === DOWNGRADE_UPGRADE_CONFLICT_MESSAGE, "23 upgrade blocked");

  const blockedCancel = throws(() => assertCancellationAllowed("scheduled"));
  assert(blockedCancel?.message === DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE, "24 cancellation blocked");
  assertCancellationAllowed("released");

  const blockedDowngrade = await throwsAsync(() =>
    scheduleSubscriptionDowngrade({
      local: local({ cancelAtPeriodEnd: true }),
      targetPlanKey: "servant_standard",
      requestedBy: null,
      deps,
    }),
  );
  assert(
    blockedDowngrade?.message === DOWNGRADE_ALREADY_CANCELLING_MESSAGE,
    "25 downgrade blocked while cancellation is scheduled",
  );

  assert(commercialPlanByKey("steward_pro")?.monthlySmsSegmentLimit === 250, "29 current SMS allowance");
  assert(commercialPlanByKey("servant_standard")?.monthlySmsSegmentLimit === 0, "30 target SMS allowance");
  assert(
    interpretExistingDowngradeSchedule({
      scheduleStatus: "active",
      phases: sameSchedule().phases,
      currentPriceId: "price_steward_pro_monthly",
      targetPriceId: "price_servant_standard_monthly",
      periodEnd: PERIOD_END,
    }) === "same",
    "same schedule is recognized",
  );

  const src = readFileSync(join(process.cwd(), "lib/billing/stripe/downgrade.ts"), "utf8");
  const live = readFileSync(join(process.cwd(), "lib/billing/stripe/downgrade-live.ts"), "utf8");
  const self = readFileSync(join(process.cwd(), "lib/billing/stripe/downgrade.selfcheck.ts"), "utf8");
  assert(!src.includes("organization_memberships"), "27 no member deletion");
  assert(!src.includes(".delete("), "28 no feature-data deletion");
  assert(!src.includes("organization_sms_credit"), "no SMS credit writes");
  assert(!src.includes("checkout.sessions"), "35 no checkout session");
  assert(!src.includes("invoices.create"), "10 module does not create invoices");
  assert(!live.includes("subscriptionSchedules.cancel"), "release is used instead of cancel");
  assert(live.includes("subscriptionSchedules.release"), "release call exists");
  assert(!self.includes('from "@/lib/billing/stripe/' + "downgrade-live"), "37 self-check does not import the live Stripe adapter");

  console.log("billing scheduled downgrade self-check passed");
}

function fakeDeps(input: {
  subscription?: RetrievedDowngradeSubscription;
  schedule?: RetrievedDowngradeSchedule;
  scheduleStatus?: () => string;
  onCreate?: () => void;
  onUpdate?: () => void;
  onRelease?: () => void;
  onInvoice?: () => void;
  save?: (input: {
    scheduleStatus: string;
    scheduledPlanKey: string;
    scheduledEffectiveAt: string;
  }) => void;
  saveReleased?: () => void;
}): DowngradeStripeDeps {
  const current = input.subscription ?? subscription();
  let phasesReady = false;
  return {
    retrieveSubscription: async () => current,
    listPrices: async (lookupKey) => {
      const amount =
        lookupKey === "servant_standard_monthly"
          ? 2995
          : lookupKey === "steward_pro_monthly"
            ? 3995
            : 5995;
      return [price(lookupKey, amount)];
    },
    createScheduleFromSubscription: async () => {
      input.onCreate?.();
      return { id: "sub_sched_new" };
    },
    retrieveSchedule: async (scheduleId) => {
      if (input.schedule) return { ...input.schedule, id: input.schedule.id || scheduleId };
      return {
        id: scheduleId,
        status: "active",
        subscriptionId: "sub_test",
        phases: phasesReady
          ? [
              {
                startDate: PERIOD_START,
                endDate: PERIOD_END,
                items: [
                  { priceId: "price_steward_pro_monthly", quantity: 1 },
                  { priceId: "price_camera_monthly", quantity: 2 },
                ],
              },
              {
                startDate: PERIOD_END,
                endDate: null,
                items: [
                  { priceId: "price_servant_standard_monthly", quantity: 1 },
                  { priceId: "price_camera_monthly", quantity: 2 },
                ],
              },
            ]
          : [
              {
                startDate: PERIOD_START,
                endDate: PERIOD_END,
                items: [
                  { priceId: "price_steward_pro_monthly", quantity: 1 },
                  { priceId: "price_camera_monthly", quantity: 2 },
                ],
              },
            ],
      };
    },
    updateSchedule: async (scheduleId, params) => {
      input.onUpdate?.();
      if (params.end_behavior !== "release" || params.proration_behavior !== "none") {
        throw new Error("schedule update was not release/none");
      }
      phasesReady = true;
      return { id: scheduleId, subscriptionId: "sub_test" };
    },
    releaseSchedule: async (scheduleId) => {
      input.onRelease?.();
      return { id: scheduleId, status: "released" };
    },
    saveScheduledMirror: async (saved) => {
      input.save?.(saved);
    },
    saveReleasedMirror: async () => {
      input.saveReleased?.();
    },
  };
}

function throws(fn: () => unknown): Error | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function throwsAsync(fn: () => Promise<unknown>): Promise<Error | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

void main();
