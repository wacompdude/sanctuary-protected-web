/**
 * Safe Stripe SDK error logging for billing.
 * Logs diagnostic fields only. Never logs secrets, raw Stripe objects,
 * headers, or customer PII.
 */

export type StripeBillingOperation =
  | "catalog_price_resolution"
  | "customer_ensure"
  | "checkout_session_create";

export type SafeStripeErrorLog = {
  operation: StripeBillingOperation;
  errorType: string | null;
  code: string | null;
  statusCode: number | null;
  requestId: string | null;
  message: string;
  connectionError: boolean;
  retries: number | null;
};

const SECRET_PATTERNS: RegExp[] = [
  /(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9.]+/g,
  /whsec_[A-Za-z0-9]+/g,
  /Bearer\s+\S+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
];

const RETRY_MESSAGE = /Request was retried (\d+) times/;

/** Stripe Node SDK error classes. App errors named Stripe* are excluded. */
const STRIPE_SDK_ERROR_TYPES = new Set([
  "StripeError",
  "StripeCardError",
  "StripeInvalidRequestError",
  "StripeAPIError",
  "StripeAuthenticationError",
  "StripePermissionError",
  "StripeRateLimitError",
  "StripeConnectionError",
  "StripeSignatureVerificationError",
  "StripeIdempotencyError",
  "StripeOAuthError",
  "StripeInvalidGrantError",
  "StripeInvalidClientError",
  "StripeOAuthInvalidRequestError",
  "StripeInvalidScopeError",
  "StripeUnsupportedGrantTypeError",
  "StripeUnsupportedResponseTypeError",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStatusCode(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/** Strip credential-like and email-like tokens from a Stripe error message. */
export function redactStripeErrorMessage(message: string): string {
  let next = message;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, "[redacted]");
  }
  return next.slice(0, 300);
}

export function isStripeSdkError(error: unknown): boolean {
  const record = asRecord(error);
  const type = readString(record?.type);
  const name = error instanceof Error ? error.name : readString(record?.name);
  return Boolean(
    (type && STRIPE_SDK_ERROR_TYPES.has(type)) ||
      (name && STRIPE_SDK_ERROR_TYPES.has(name)),
  );
}

export function readStripeRetryCount(message: string): number | null {
  const match = RETRY_MESSAGE.exec(message);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) ? count : null;
}

/**
 * Build a log record from a Stripe SDK error.
 * Ignores raw, headers, detail, and payment objects.
 */
export function extractSafeStripeErrorLog(
  operation: StripeBillingOperation,
  error: unknown,
): SafeStripeErrorLog {
  const record = asRecord(error);
  const message =
    error instanceof Error
      ? error.message
      : readString(record?.message) ?? "Stripe request failed";
  const errorType =
    readString(record?.type) ??
    (error instanceof Error ? error.name : null);

  return {
    operation,
    errorType,
    code: readString(record?.code),
    statusCode: readStatusCode(record?.statusCode),
    requestId: readString(record?.requestId),
    message: redactStripeErrorMessage(message),
    connectionError: errorType === "StripeConnectionError",
    retries: readStripeRetryCount(message),
  };
}

/** Log one safe line. Does not rethrow. */
export function logStripeBillingError(
  operation: StripeBillingOperation,
  error: unknown,
): void {
  if (!isStripeSdkError(error)) return;
  const safe = extractSafeStripeErrorLog(operation, error);
  console.error("[billing.stripe]", JSON.stringify(safe));
}

/**
 * Run a Checkout Stripe step and log Stripe SDK failures without changing
 * the thrown error (user-facing message stays the SDK/app message).
 */
export async function withStripeBillingErrorLog<T>(
  operation: StripeBillingOperation,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logStripeBillingError(operation, error);
    throw error;
  }
}
