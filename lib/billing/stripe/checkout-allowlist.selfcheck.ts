/**
 * Stage 3D Checkout allowlist self-check (no Stripe Live mutations, no DB required
 * for pure evaluation; static wiring checks for enforcement paths).
 * Run: npx --yes tsx lib/billing/stripe/checkout-allowlist.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BillingAuthorizationError } from "@/lib/billing/errors";
import {
  CHECKOUT_PILOT_GATE_DISABLED_MESSAGE,
  CHECKOUT_PILOT_UNAVAILABLE_MESSAGE,
  assertLiveSubscriptionCheckoutAllowed,
  evaluateCheckoutApproval,
  evaluateLiveSubscriptionCheckoutAuthorization,
  isLiveCheckoutUiAvailable,
  mapCheckoutApprovalRow,
  type CheckoutApprovalRecord,
} from "@/lib/billing/stripe/checkout-allowlist";
import { createSubscriptionCheckoutSession } from "@/lib/billing/stripe/checkout";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const NOW = new Date("2026-11-06T12:00:00.000Z");
const LIVE_KEY = "sk_live_stage3d_selfcheck_NOT_A_REAL_SECRET";
const TEST_KEY = "sk_test_stage3d_selfcheck_NOT_A_REAL_SECRET";

function approval(
  overrides: Partial<CheckoutApprovalRecord> & { organizationId: string },
): CheckoutApprovalRecord {
  return {
    status: "active",
    approvedAt: "2026-01-01T00:00:00.000Z",
    approvedByPlatformAccountId: "plat_1",
    expiresAt: null,
    notes: null,
    revokedAt: null,
    revokedByPlatformAccountId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let stripeCreates = 0;
const throwingCheckout = {
  async createSubscriptionCheckoutSession() {
    stripeCreates += 1;
    throw new Error("Stripe must not be called");
  },
};

async function tryLiveCreate(input: {
  organizationId: string;
  loadApproval: (id: string) => Promise<CheckoutApprovalRecord | null>;
  gate: string | undefined;
}) {
  const prev = process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
  if (input.gate === undefined) delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
  else process.env.STRIPE_LIVE_CHECKOUT_ENABLED = input.gate;
  const before = stripeCreates;
  let denied = false;
  let allowed = false;
  try {
    await createSubscriptionCheckoutSession(
      {
        organizationId: input.organizationId,
        planKey: PLAN_KEYS.SERVANT_STANDARD,
        origin: "https://app.example.test",
        successUrl: "https://app.example.test/settings/billing?checkout=success",
        cancelUrl: "https://app.example.test/settings/billing?checkout=cancelled",
        attemptToken: "tok-3d",
        stripeSecretKey: LIVE_KEY,
      },
      {
        listPrices: async () => {
          throw new Error("must not resolve price when denied");
        },
        store: {
          async getMappedCustomer() {
            throw new Error("must not map customer");
          },
          async upsertMappedCustomer() {
            throw new Error("must not upsert");
          },
          async getBillingContact() {
            return { email: null, name: null, organizationName: null };
          },
        } as never,
        stripeCustomers: {
          async createCustomer() {
            throw new Error("must not create customer");
          },
        },
        stripeCheckout: throwingCheckout,
        loadCheckoutApproval: input.loadApproval,
      },
    );
    allowed = true;
  } catch (error) {
    denied =
      error instanceof BillingAuthorizationError ||
      (error instanceof Error &&
        (error.name === "StripeLiveModeForbiddenError" ||
          error.message.includes("STRIPE_LIVE_CHECKOUT_ENABLED") ||
          error.message.includes(CHECKOUT_PILOT_UNAVAILABLE_MESSAGE) ||
          error.message.includes(CHECKOUT_PILOT_GATE_DISABLED_MESSAGE)));
    if (!denied) throw error;
  } finally {
    if (prev === undefined) delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    else process.env.STRIPE_LIVE_CHECKOUT_ENABLED = prev;
  }
  return {
    denied,
    allowed,
    stripeInvoked: stripeCreates > before,
  };
}

async function main() {
  // Pure evaluation
  assert(
    evaluateCheckoutApproval(null, NOW).ok === false &&
      evaluateCheckoutApproval(null, NOW).reason === "missing",
    "[5] missing allowlist DENY",
  );
  assert(
    evaluateCheckoutApproval(
      approval({ organizationId: "org_a", status: "inactive" }),
      NOW,
    ).reason === "inactive",
    "[6] inactive DENY",
  );
  assert(
    evaluateCheckoutApproval(
      approval({
        organizationId: "org_a",
        expiresAt: "2026-11-01T00:00:00.000Z",
      }),
      NOW,
    ).reason === "expired",
    "[7] expired DENY",
  );
  assert(
    evaluateCheckoutApproval(
      approval({ organizationId: "" }),
      NOW,
    ).reason === "invalid_organization",
    "[8] invalid org DENY",
  );
  assert(
    evaluateCheckoutApproval(
      approval({
        organizationId: "org_a",
        expiresAt: "2026-12-01T00:00:00.000Z",
      }),
      NOW,
    ).ok,
    "active unexpired ALLOW",
  );
  assert(
    evaluateCheckoutApproval(
      approval({ organizationId: "org_a", status: "revoked" }),
      NOW,
    ).reason === "revoked",
    "[20] revoked DENY",
  );

  // Combined Live authorization
  {
    const prev = process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    const d1 = evaluateLiveSubscriptionCheckoutAuthorization({
      organizationId: "org_a",
      secretKey: LIVE_KEY,
      approval: approval({ organizationId: "org_a" }),
      now: NOW,
    });
    assert(!d1.ok && d1.reason === "live_gate_disabled", "[1] gate FALSE + approved DENY");
    const d2 = evaluateLiveSubscriptionCheckoutAuthorization({
      organizationId: "org_a",
      secretKey: LIVE_KEY,
      approval: null,
      now: NOW,
    });
    assert(!d2.ok && d2.reason === "live_gate_disabled", "[2] gate FALSE + not approved DENY");
    process.env.STRIPE_LIVE_CHECKOUT_ENABLED = "true";
    const d3 = evaluateLiveSubscriptionCheckoutAuthorization({
      organizationId: "org_a",
      secretKey: LIVE_KEY,
      approval: approval({ organizationId: "org_a" }),
      now: NOW,
      clientClaimsApproved: true,
    });
    assert(d3.ok && d3.mode === "live", "[3/15] gate TRUE + approved ALLOW (forged client flag ignored)");
    const d4 = evaluateLiveSubscriptionCheckoutAuthorization({
      organizationId: "org_a",
      secretKey: LIVE_KEY,
      approval: null,
      now: NOW,
    });
    assert(!d4.ok && d4.reason === "missing_approval", "[4] gate TRUE + not approved DENY");
    const d25 = evaluateLiveSubscriptionCheckoutAuthorization({
      organizationId: "org_a",
      secretKey: LIVE_KEY,
      approval: approval({ organizationId: "org_a" }),
      now: NOW,
    });
    delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    const d25b = evaluateLiveSubscriptionCheckoutAuthorization({
      organizationId: "org_a",
      secretKey: LIVE_KEY,
      approval: approval({ organizationId: "org_a" }),
      now: NOW,
    });
    assert(d25.ok && !d25b.ok, "[25] global gate authoritative even with approval");
    if (prev === undefined) delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    else process.env.STRIPE_LIVE_CHECKOUT_ENABLED = prev;
  }

  // Cross-org: approval for A does not authorize B
  {
    process.env.STRIPE_LIVE_CHECKOUT_ENABLED = "true";
    const approvalA = approval({ organizationId: "org_a" });
    const forB = evaluateLiveSubscriptionCheckoutAuthorization({
      organizationId: "org_b",
      secretKey: LIVE_KEY,
      approval: approvalA.organizationId === "org_b" ? approvalA : null,
      now: NOW,
    });
    assert(!forB.ok, "[13/14] cross-org approval reuse DENY");
    delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
  }

  // Session create DENY paths must not invoke Stripe
  {
    const r1 = await tryLiveCreate({
      organizationId: "org_a",
      gate: undefined,
      loadApproval: async () => approval({ organizationId: "org_a" }),
    });
    assert(r1.denied && !r1.stripeInvoked, "[1/16] gate off: no Stripe invoke");

    const r4 = await tryLiveCreate({
      organizationId: "org_a",
      gate: "true",
      loadApproval: async () => null,
    });
    assert(r4.denied && !r4.stripeInvoked, "[4/16] missing approval: no Stripe invoke");

    const r6 = await tryLiveCreate({
      organizationId: "org_a",
      gate: "true",
      loadApproval: async () =>
        approval({ organizationId: "org_a", status: "inactive" }),
    });
    assert(r6.denied && !r6.stripeInvoked, "[6] inactive: no Stripe invoke");

    const r7 = await tryLiveCreate({
      organizationId: "org_a",
      gate: "true",
      loadApproval: async () =>
        approval({
          organizationId: "org_a",
          expiresAt: "2020-01-01T00:00:00.000Z",
        }),
    });
    assert(r7.denied && !r7.stripeInvoked, "[7] expired: no Stripe invoke");

    const r20 = await tryLiveCreate({
      organizationId: "org_a",
      gate: "true",
      loadApproval: async () =>
        approval({ organizationId: "org_a", status: "revoked" }),
    });
    assert(r20.denied && !r20.stripeInvoked, "[20] revoked: no Stripe invoke");
  }

  // ALLOW authorization in isolated fixture (gate + approval); Session create
  // path already covered by checkout.selfcheck with injectable approval.
  {
    const prev = process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    process.env.STRIPE_LIVE_CHECKOUT_ENABLED = "true";
    const mode = await assertLiveSubscriptionCheckoutAllowed({
      organizationId: "org_pilot",
      secretKey: LIVE_KEY,
      loadApproval: async (organizationId) => approval({ organizationId }),
    });
    assert(mode === "live", "[3/11] gate TRUE + owner-approved org ALLOW");
    if (prev === undefined) delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    else process.env.STRIPE_LIVE_CHECKOUT_ENABLED = prev;
  }

  // Test mode does not require allowlist
  {
    await assertLiveSubscriptionCheckoutAllowed({
      organizationId: "org_any",
      secretKey: TEST_KEY,
      loadApproval: async () => null,
    });
  }

  // UI helper
  assert(
    !isLiveCheckoutUiAvailable({
      stripeConfigured: true,
      liveCheckoutGateEnabled: false,
      organizationApproved: true,
      secretIsTest: false,
    }),
    "UI: approved but gate off → no CTA",
  );
  assert(
    !isLiveCheckoutUiAvailable({
      stripeConfigured: true,
      liveCheckoutGateEnabled: true,
      organizationApproved: false,
      secretIsTest: false,
    }),
    "UI: gate on but not approved → no CTA",
  );
  assert(
    isLiveCheckoutUiAvailable({
      stripeConfigured: true,
      liveCheckoutGateEnabled: true,
      organizationApproved: true,
      secretIsTest: false,
    }),
    "UI: both true → CTA",
  );

  assert(
    mapCheckoutApprovalRow({
      organization_id: "org_x",
      status: "active",
      approved_at: "2026-01-01T00:00:00.000Z",
    })?.organizationId === "org_x",
    "row mapping",
  );

  // Static wiring / admin / RLS migration
  const checkoutSrc = readSource("lib/billing/stripe/checkout.ts");
  assert(
    checkoutSrc.includes("assertLiveSubscriptionCheckoutAllowed"),
    "[16] createSubscriptionCheckoutSession enforces allowlist",
  );
  const actions = readSource("app/(app)/settings/billing/actions.ts");
  assert(
    actions.includes("evaluateLiveSubscriptionCheckoutAuthorization"),
    "[16] startCheckoutAction re-evaluates allowlist",
  );
  assert(
    !actions.includes('formData.get("isAdmin")'),
    "[15/18] no client isAdmin trust",
  );
  const page = readSource("app/(app)/settings/billing/page.tsx");
  assert(
    page.includes("CHECKOUT_PILOT_UNAVAILABLE_MESSAGE") ||
      page.includes("checkoutAvailabilityMessage"),
    "[UX] billing page surfaces pilot messaging",
  );
  const platformActions = readSource("app/platform/actions.ts");
  assert(
    platformActions.includes("billing.checkout_pilot.manage"),
    "[18/19] platform manage permission required",
  );
  assert(
    platformActions.includes("approveCheckoutPilotAction"),
    "[J] approve action exists",
  );
  const mig = readSource(
    "supabase/migrations/118_organization_checkout_approvals.sql",
  );
  assert(
    mig.includes("ENABLE ROW LEVEL SECURITY") &&
      mig.includes("FORCE ROW LEVEL SECURITY") &&
      mig.includes("REVOKE ALL ON TABLE public.organization_checkout_approvals FROM authenticated"),
    "[L] RLS force + revoke authenticated",
  );
  assert(
    !mig.includes("INSERT INTO public.organization_checkout_approvals"),
    "no automatic Production approvals seeded",
  );
  assert(
    mig.includes("billing.checkout_pilot.manage"),
    "platform permission seeded",
  );

  // Existing paid / webhooks / downgrade / isolation untouched markers
  const liveIso = readSource("lib/billing/stripe/live-test-isolation.selfcheck.ts");
  assert(liveIso.includes("isProductionSubscriptionAuthority"), "[24] isolation selfcheck present");
  const webhook = readSource("lib/billing/stripe/webhook-dispatch.ts");
  assert(
    !webhook.includes("assertLiveSubscriptionCheckoutAllowed"),
    "[22] webhooks not gated by checkout allowlist",
  );
  const downgrade = readSource("lib/billing/stripe/downgrade.ts");
  assert(
    !downgrade.includes("assertLiveSubscriptionCheckoutAllowed"),
    "[23] downgrades use separate path",
  );

  console.log("checkout allowlist self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
