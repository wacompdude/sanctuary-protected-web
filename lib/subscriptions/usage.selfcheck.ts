import {
  estimateSmsCodeUnits,
  estimateSmsSegments,
  estimateSmsSegmentsForRecipients,
  isGsm7Compatible,
} from "@/lib/subscriptions/sms-segments";
import { resolveBillingPeriod, usageWarningLevel } from "@/lib/subscriptions/usage";

/**
 * Phase 6 usage metering self-check (no database required).
 * Run: npx --yes tsx lib/subscriptions/usage.selfcheck.ts
 */
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(isGsm7Compatible("Hello church"), "basic ASCII is GSM-7");
assert(!isGsm7Compatible("你好"), "CJK is not GSM-7");
assert(estimateSmsSegments("Hi") === 1, "short GSM-7 is 1 segment");
assert(
  estimateSmsSegments("a".repeat(161)) === 2,
  "161 GSM-7 units become 2 segments",
);
assert(estimateSmsSegments("🙂") === 1, "single emoji (2 UTF-16 units) is 1 segment");
assert(
  estimateSmsSegments("🙂".repeat(36)) === 2,
  "72 UCS-2 code units become 2 segments",
);
assert(
  estimateSmsSegmentsForRecipients({ body: "Hi", recipientCount: 3 }) === 3,
  "segments scale by recipients",
);
assert(
  estimateSmsCodeUnits("^{}").units === 6,
  "GSM-7 extended chars cost 2 units each",
);

assert(usageWarningLevel(0, 100, false) === "none", "0% is none");
assert(usageWarningLevel(80, 100, false) === "warning", "80% is warning");
assert(usageWarningLevel(95, 100, false) === "critical", "95% is critical");
assert(usageWarningLevel(100, 100, false) === "exceeded", "100% is exceeded");
assert(usageWarningLevel(999, null, true) === "none", "unlimited never warns");
assert(usageWarningLevel(1, 0, false) === "exceeded", "limit 0 blocks usage");

const period = resolveBillingPeriod({
  currentPeriodStart: "2026-01-01T00:00:00.000Z",
  currentPeriodEnd: "2026-01-31T00:00:00.000Z",
});
assert(
  period.periodStart === "2026-01-01T00:00:00.000Z",
  "explicit period start preserved",
);
assert(
  period.periodEnd === "2026-01-31T00:00:00.000Z",
  "explicit period end preserved",
);

const rolled = resolveBillingPeriod({
  startedAt: "2026-01-01T00:00:00.000Z",
  now: new Date("2026-02-15T12:00:00.000Z"),
});
assert(
  new Date(rolled.periodStart) <= new Date("2026-02-15T12:00:00.000Z"),
  "rolled period starts on or before now",
);
assert(
  new Date(rolled.periodEnd) >= new Date("2026-02-15T12:00:00.000Z"),
  "rolled period ends on or after now",
);

console.log("subscription usage self-check passed");
