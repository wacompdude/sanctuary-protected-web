/**
 * Server-owned Checkout return URLs (Phase 4B-3).
 * Never trust arbitrary browser-supplied success/cancel URLs.
 */

import { BillingCheckoutUrlError } from "@/lib/billing/errors";

export const BILLING_CHECKOUT_PATH = "/settings/billing";

export function resolveAppOrigin(input?: {
  appUrl?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
}): string {
  const configured = (input?.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (configured) return configured;

  const host = (input?.forwardedHost || input?.host || "").trim();
  const proto = (input?.forwardedProto || "http").trim() || "http";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

export function buildBillingCheckoutUrls(origin: string): {
  successUrl: string;
  cancelUrl: string;
} {
  const base = origin.replace(/\/$/, "");
  return {
    successUrl: `${base}${BILLING_CHECKOUT_PATH}?checkout=success`,
    cancelUrl: `${base}${BILLING_CHECKOUT_PATH}?checkout=cancelled`,
  };
}

/**
 * Ensure success/cancel URLs stay on a shared origin and billing path.
 * When `expectedOrigin` is provided (e.g. NEXT_PUBLIC_APP_URL), both URLs
 * must match that origin — prevents open redirects.
 */
export function assertSafeBillingCheckoutUrls(input: {
  successUrl: string;
  cancelUrl: string;
  expectedOrigin?: string | null;
}): void {
  const success = parseAbsoluteUrl(input.successUrl, "success");
  const cancel = parseAbsoluteUrl(input.cancelUrl, "cancel");

  if (success.origin !== cancel.origin) {
    throw new BillingCheckoutUrlError(
      "Checkout success and cancel URLs must share the same origin.",
    );
  }
  if (success.pathname !== BILLING_CHECKOUT_PATH) {
    throw new BillingCheckoutUrlError(
      `Checkout success URL must return to ${BILLING_CHECKOUT_PATH}.`,
    );
  }
  if (cancel.pathname !== BILLING_CHECKOUT_PATH) {
    throw new BillingCheckoutUrlError(
      `Checkout cancel URL must return to ${BILLING_CHECKOUT_PATH}.`,
    );
  }

  const expected = (input.expectedOrigin ?? "").trim();
  if (expected) {
    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(expected).origin;
    } catch {
      throw new BillingCheckoutUrlError("Configured application origin is invalid.");
    }
    if (success.origin !== expectedOrigin) {
      throw new BillingCheckoutUrlError(
        "Checkout return URLs must use the configured application origin.",
      );
    }
  }
}

function parseAbsoluteUrl(url: string, kind: "success" | "cancel"): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BillingCheckoutUrlError(`Invalid Checkout ${kind} URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BillingCheckoutUrlError(`Invalid Checkout ${kind} URL protocol.`);
  }
  return parsed;
}
