/**
 * Login MFA policy self-check (no database required).
 * Run: npx --yes tsx lib/mfa/foundation.selfcheck.ts
 */
import { createMfaCookieValue, verifyMfaCookie } from "@/lib/mfa/session-cookie";
import {
  generateMfaCode,
  hashMfaCode,
  mfaCodeHashesMatch,
  normalizeMfaCodeInput,
} from "@/lib/mfa/codes";
import { maskEmailForMfa, maskPhoneForMfa } from "@/lib/mfa/mask";
import { resolveLoginSmsDestination, toVerifiedPhoneE164 } from "@/lib/mfa/phone";
import {
  MFA_CODE_LENGTH,
  MFA_COOKIE_NAME,
  isMfaChannel,
  isMfaPurpose,
} from "@/lib/mfa/policy";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(MFA_CODE_LENGTH === 6, "codes are 6 digits");
  assert(MFA_COOKIE_NAME === "sp_mfa", "mfa cookie name");
  assert(isMfaPurpose("login") && isMfaPurpose("phone_enroll"), "purposes");
  assert(isMfaChannel("email") && isMfaChannel("sms"), "channels");
  assert(!isMfaPurpose("totp") && !isMfaChannel("voice"), "unknown values rejected");

  assert(
    maskEmailForMfa("tknuth@example.com") === "t*****@example.com",
    "email mask",
  );
  assert(maskPhoneForMfa("+14255555817") === "(***) ***-5817", "phone mask");

  assert(toVerifiedPhoneE164("425-555-1234") === "+14255551234", "us e164");
  assert(toVerifiedPhoneE164("+14255551234") === "+14255551234", "already e164");
  assert(toVerifiedPhoneE164("not-a-phone") === null, "invalid phone");

  assert(
    resolveLoginSmsDestination("+14255551234") === "+14255551234",
    "login sms uses stored number",
  );
  assert(
    resolveLoginSmsDestination(null) === null,
    "login sms refuses missing number",
  );

  const typedAtLogin = "+19995550123";
  assert(
    resolveLoginSmsDestination("+14255551234") !== typedAtLogin,
    "login ignores attacker-supplied phone",
  );

  const code = generateMfaCode();
  assert(/^\d{6}$/.test(code), "generated code shape");
  assert(normalizeMfaCodeInput("12 34 56") === "123456", "normalize code");
  assert(normalizeMfaCodeInput("12345") === null, "short code rejected");

  const challengeId = "11111111-1111-4111-8111-111111111111";
  const hash = hashMfaCode("123456", challengeId);
  assert(mfaCodeHashesMatch(hash, hashMfaCode("123456", challengeId)), "hash match");
  assert(
    !mfaCodeHashesMatch(hash, hashMfaCode("123457", challengeId)),
    "wrong code does not match",
  );
  assert(
    !mfaCodeHashesMatch(
      hash,
      hashMfaCode("123456", "22222222-2222-4222-8222-222222222222"),
    ),
    "hash is bound to challenge id",
  );

  const signed = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-1",
  });
  assert(signed !== null, "cookie signed");
  assert(
    await verifyMfaCookie({
      token: signed?.value,
      userId: "user-1",
      sessionId: "session-1",
    }),
    "cookie verifies",
  );
  assert(
    !(await verifyMfaCookie({
      token: signed?.value,
      userId: "user-1",
      sessionId: "other-session",
    })),
    "cookie is bound to auth session",
  );
  assert(
    !(await verifyMfaCookie({
      token: signed?.value,
      userId: "other-user",
      sessionId: "session-1",
    })),
    "cookie is bound to user",
  );

  const skip = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-1",
    kind: "policy_skip",
    organizationId: "org-a",
  });
  assert(
    await verifyMfaCookie({
      token: skip?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-a",
    }),
    "policy skip verifies for matching org",
  );
  assert(
    !(await verifyMfaCookie({
      token: skip?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-b",
    })),
    "policy skip does not transfer to another org",
  );
  assert(
    !(await verifyMfaCookie({
      token: skip?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-a",
      reauthAfterMs: Date.now() + 10_000,
    })),
    "policy skip is stale after require MFA immediately",
  );

  console.log("mfa foundation self-check: ok");
}

void main();
