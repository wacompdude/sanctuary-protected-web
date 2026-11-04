/**
 * Stage 3C manual plan activation security self-check (no database, no Stripe API).
 * Run: npx --yes tsx lib/billing/manual-plan-security.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const actions = readSource("app/(app)/settings/billing/actions.ts");
const panel = readSource("components/billing/billing-plan-panel.tsx");
const page = readSource("app/(app)/settings/billing/page.tsx");
const platform = readSource("lib/platform/subscription-admin.ts");
const platformAction = readSource("app/platform/actions.ts");

// Server action refuses when Stripe is configured (before mutation)
assert(
  actions.includes("export async function applyPlanWithoutProviderAction"),
  "[8] applyPlanWithoutProviderAction exists",
);
assert(
  /applyPlanWithoutProviderAction[\s\S]*?getBillingProvider\(\)/.test(actions),
  "[8] action resolves billing provider server-side",
);
assert(
  /applyPlanWithoutProviderAction[\s\S]*?provider\.isConfigured\(\)/.test(actions),
  "[1/10] Stripe configured blocks manual activation",
);
assert(
  actions.includes("Manual plan assignment is not available while Stripe billing is configured"),
  "[10] explicit refusal message when Stripe configured",
);

// Must still require billing manage access (owner/co_owner)
assert(
  /applyPlanWithoutProviderAction[\s\S]*?requireBillingManageAccess\(\)/.test(
    actions,
  ),
  "[1-3] requireBillingManageAccess gates the action",
);

// Never trust client-supplied stripeConfigured / isPaid flags
assert(
  !/formData\.get\(["']stripeConfigured["']\)/.test(actions),
  "[5] no client stripeConfigured flag",
);
assert(
  !/formData\.get\(["']isPaid["']\)/.test(actions),
  "[5] no client isPaid flag",
);
assert(
  !/formData\.get\(["']isAdmin["']\)/.test(actions),
  "[5] no client isAdmin flag",
);

// UI must not fall back to manual apply when Stripe is configured
assert(
  panel.includes("allowManualPlanAssignment"),
  "[10] BillingPlanPanel respects allowManualPlanAssignment",
);
assert(
  panel.includes("Manual plan activation is disabled while Stripe billing is configured") ||
    panel.includes("Checkout is not available yet"),
  "[10] panel surfaces checkout-unavailable instead of silent bypass",
);
assert(
  page.includes("allowManualPlanAssignment={!stripeConfigured}"),
  "[10] billing page disables manual assignment when Stripe configured",
);
assert(
  page.includes("checkoutUiAvailable"),
  "[11] checkout CTA gated separately from Stripe configuration",
);

// Platform Super Admin path remains the audited exception
assert(
  platform.includes("export async function applyPlatformPlanChange"),
  "[15] platform applyPlatformPlanChange preserved",
);
assert(
  platform.includes("platform_admin_console"),
  "[15/16] platform changes use audited source",
);
assert(
  platformAction.includes("applyPlatformPlanChangeAction"),
  "[15] platform action wiring preserved",
);
assert(
  /applyPlatformPlanChange[\s\S]*?reason/.test(platform),
  "[16] platform path requires reason",
);

// changeChurchSubscriptionPlan status active only after provider gate in owner action
const manualBlock = actions.slice(
  actions.indexOf("export async function applyPlanWithoutProviderAction"),
  actions.indexOf("export async function requestCancellationAction"),
);
assert(
  manualBlock.includes('provider.isConfigured()'),
  "[8] configured check appears inside applyPlanWithoutProviderAction",
);
assert(
  manualBlock.indexOf("provider.isConfigured()") <
    manualBlock.indexOf("changeChurchSubscriptionPlan"),
  "[8] configured check runs before subscription mutation",
);
assert(
  manualBlock.includes('status: "active"'),
  "manual path still sets active only when allowed",
);

console.log("manual plan security self-check passed");
