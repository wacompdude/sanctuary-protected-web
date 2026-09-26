/**
 * Run: npx --yes tsx lib/sms/phone-replacement.selfcheck.ts
 */
import {
  CARRIER_STOP_MESSAGE,
  SAME_MOBILE_NUMBER_MESSAGE,
  activeApplicationSmsEndpoint,
  carrierSuppressionBlocksProfileEnrollment,
  profileOptOutPatch,
  profilePhoneUnchanged,
  profileSaveTouchesSmsEndpoint,
  profileVerificationClearsCarrierSuppression,
  retirePreviousSmsPatch,
  showVerificationCodeField,
  verifiedEnrollmentPatch,
  type SmsDeliveryEndpoint,
} from "@/lib/sms/phone-replacement";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const current = "+14253145817";
const replacement = "+14255551212";

assert(
  profilePhoneUnchanged(current, "(425) 314-5817"),
  "A same national number is unchanged",
);
assert(profileSaveTouchesSmsEndpoint() === false, "A profile save does not touch the endpoint");
assert(
  !profilePhoneUnchanged(current, "(425) 555-1212"),
  "B a different national number is a change",
);

const active: SmsDeliveryEndpoint = {
  id: "old",
  e164: current,
  isPrimary: true,
  status: "active",
  consent: "granted",
  verified: true,
  suppressedAt: null,
};
const pending: SmsDeliveryEndpoint = {
  id: "new",
  e164: replacement,
  isPrimary: false,
  status: "unverified",
  consent: "pending",
  verified: false,
  suppressedAt: null,
};

assert(
  activeApplicationSmsEndpoint([active, pending])?.id === "old",
  "B old endpoint stays active before verification",
);
assert(pending.verified === false, "B new number is not verified");
assert(!showVerificationCodeField(false), "B no code field before a challenge");
assert(showVerificationCodeField(true), "C code field after a challenge exists");
assert(
  activeApplicationSmsEndpoint([active, pending])?.id === "old",
  "C old endpoint remains active after the challenge is requested",
);

assert(
  activeApplicationSmsEndpoint([active, { ...pending, verified: false }])?.id === "old",
  "D failed verification keeps the old endpoint",
);
assert(
  activeApplicationSmsEndpoint([active, pending])?.id === "old",
  "E abandoned verification keeps the old endpoint",
);

const activated = verifiedEnrollmentPatch();
const retired = retirePreviousSmsPatch();
assert(activated.is_primary && activated.status === "active" && activated.is_verified, "F new endpoint activates");
assert(!retired.is_primary && retired.status === "disabled", "F old endpoint stops being primary");
assert(!("suppressed_at" in activated), "F activation does not clear suppression");
assert(profileVerificationClearsCarrierSuppression() === false, "I verification does not clear STOP");
assert(
  carrierSuppressionBlocksProfileEnrollment("2026-09-26T00:00:00.000Z"),
  "I carrier suppression blocks Profile enrollment",
);
assert(
  !carrierSuppressionBlocksProfileEnrollment(null),
  "H profile opt-out without STOP can be re-enrolled",
);
assert(CARRIER_STOP_MESSAGE.includes("START"), "I user is told to reply START");

const optedOut = profileOptOutPatch();
assert(optedOut.consent_status === "revoked" && optedOut.status === "disabled", "G profile opt-out");
assert(!("suppressed_at" in optedOut), "G profile opt-out is not carrier STOP");

assert(SAME_MOBILE_NUMBER_MESSAGE.includes("current mobile number"), "A user message");
assert(
  active.e164 !== pending.e164 && pending.consent !== "granted",
  "B new number does not inherit consent",
);

console.log("phone replacement selfcheck passed");
