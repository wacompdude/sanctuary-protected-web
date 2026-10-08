"use server";

import { requirePlatformPermission } from "@/lib/platform/auth";
import {
  authorizeStripeConnectivityProbe,
  runStripeConnectivityProbe,
  type StripeConnectivityProbeResult,
} from "@/lib/billing/stripe/connectivity-probe";

export type StripeConnectivityActionState =
  | { ok: true; result: StripeConnectivityProbeResult }
  | { ok: false; error: string }
  | null;

export async function runStripeConnectivityDiagnosticAction(
  _prev: StripeConnectivityActionState,
): Promise<StripeConnectivityActionState> {
  void _prev;
  const auth = await authorizeStripeConnectivityProbe(async () => {
    await requirePlatformPermission("system.health.read");
  });
  if (!auth.ok) return auth;

  try {
    const result = await runStripeConnectivityProbe();
    console.info("[billing.stripe.connectivity]", JSON.stringify(result));
    return { ok: true, result };
  } catch {
    return { ok: false, error: "Stripe connectivity diagnostic failed." };
  }
}
