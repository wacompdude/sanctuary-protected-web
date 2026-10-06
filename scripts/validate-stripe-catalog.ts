/**
 * Phase 4B-2 read-only Stripe commercial catalog validation (SANDBOX ONLY).
 *
 * Usage:
 *   npm run billing:stripe:validate-catalog
 *
 * Requires ignored local env (.env.local preferred):
 *   BILLING_PROVIDER=stripe
 *   STRIPE_SECRET_KEY=<YOUR_STRIPE_SANDBOX_SECRET_KEY>
 *
 * Refuses live / unknown key modes. Never prints secrets.
 * Never creates or modifies Stripe objects. Never writes to Supabase.
 */

import { loadEnvConfig } from "@next/env";
import {
  resolveBillingProviderIdFromEnv,
  readStripeSecretKey,
} from "../lib/billing/stripe/config";
import {
  assertSandboxCatalogValidationMode,
  validateStripeCommercialCatalog,
} from "../lib/billing/stripe/catalog";
import { createStripeCatalogPriceLister } from "../lib/billing/stripe/catalog-stripe";

// Next.js-compatible env loading (.env.local, .env, etc.)
loadEnvConfig(process.cwd());

function sanitizeForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (
      value.startsWith("sk_") ||
      value.startsWith("rk_") ||
      value.startsWith("whsec_")
    ) {
      return "[redacted]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("secret") ||
        lower.includes("authorization") ||
        lower === "stripe_secret_key"
      ) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeForLog(nested);
      }
    }
    return out;
  }
  return value;
}

async function main(): Promise<void> {
  let providerId: string;
  try {
    providerId = resolveBillingProviderIdFromEnv(process.env.BILLING_PROVIDER);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Invalid BILLING_PROVIDER.",
    );
    process.exitCode = 1;
    return;
  }

  if (providerId !== "stripe") {
    console.error(
      `BILLING_PROVIDER must be "stripe" for catalog validation (got "${providerId}").`,
    );
    process.exitCode = 1;
    return;
  }

  const secretKey = readStripeSecretKey();
  let mode: "test";
  try {
    mode = assertSandboxCatalogValidationMode(secretKey);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Key mode rejected.");
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        phase: "4B-2",
        action: "validateStripeCommercialCatalog",
        mode,
        mutation: false,
        note: "Read-only Stripe Price lookup by approved lookup keys.",
      },
      null,
      2,
    ),
  );

  const listPrices = createStripeCatalogPriceLister(secretKey);
  const report = await validateStripeCommercialCatalog({
    listPrices,
    mode,
  });

  console.log(JSON.stringify(sanitizeForLog(report), null, 2));

  if (!report.valid) {
    console.error(
      `Catalog validation failed: ${report.errors.length} mismatched entr(y/ies).`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Catalog validation passed: ${report.entriesChecked} approved entries OK (sandbox).`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  if (
    typeof message === "string" &&
    (message.includes("sk_") || message.includes("whsec_"))
  ) {
    console.error("Catalog validation failed (details redacted).");
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
