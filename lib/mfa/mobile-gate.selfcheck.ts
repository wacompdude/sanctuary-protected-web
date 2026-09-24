/**
 * Mobile MFA gate self-check (no database, no SMS).
 * Run: npx --yes tsx lib/mfa/mobile-gate.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AuditAction } from "@/lib/audit/actions";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize";
import { decideMobileMfaAccess, MOBILE_MFA_HEADER } from "@/lib/mfa/mobile-gate";
import {
  getMfaCodePepper,
  getMfaSessionSecret,
  getTrustedDevicePepper,
} from "@/lib/mfa/secrets";
import { getMfaSmsSender } from "@/lib/mfa/send-sms";
import {
  createMfaCookieValue,
  inspectMfaCookie,
  verifyMfaCookie,
  type InspectMfaCookieResult,
} from "@/lib/mfa/session-cookie";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const emptyInspect: Pick<
  InspectMfaCookieResult,
  "authentic" | "satisfiesReauth" | "kind"
> = {
  authentic: false,
  satisfiesReauth: false,
  kind: null,
};

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(previous)) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  assert(MOBILE_MFA_HEADER === "x-sanctuary-mfa", "MFA proof header name");
  assert(AuditAction.AUTH_MFA_REQUIRED === "auth.mfa_required", "mfa required audit");

  const signed = await createMfaCookieValue({
    userId: "user-a",
    sessionId: "session-a",
    kind: "verified",
  });
  assert(signed !== null, "signed MFA token");

  const validInspect = await inspectMfaCookie({
    token: signed?.value,
    userId: "user-a",
    sessionId: "session-a",
  });

  // TEST 1 / TEST 8: password session, MFA required, no proof
  const noProof = decideMobileMfaAccess({
    policyRequired: true,
    inspected: emptyInspect,
  });
  assert(!noProof.allow && noProof.status === "mfa_required", "TEST 1 rejected without MFA proof");

  // TEST 2: valid completed MFA proof
  const withProof = decideMobileMfaAccess({
    policyRequired: true,
    inspected: validInspect,
  });
  assert(withProof.allow && withProof.mfaSatisfied, "TEST 2 valid proof allowed");

  // TEST 3: forged token
  const forged = `${signed?.value.slice(0, 12) ?? ""}deadbeef.${signed?.value.split(".")[1] ?? "sig"}`;
  assert(
    !(await verifyMfaCookie({
      token: forged,
      userId: "user-a",
      sessionId: "session-a",
    })),
    "TEST 3 forged token rejected",
  );

  // TEST 4: expired token
  const expired = await createMfaCookieValue({
    userId: "user-a",
    sessionId: "session-a",
    maxAgeSeconds: 0,
  });
  assert(
    !(await verifyMfaCookie({
      token: expired?.value,
      userId: "user-a",
      sessionId: "session-a",
    })),
    "TEST 4 expired token rejected",
  );

  // TEST 5: User A token with User B session
  assert(
    !(await verifyMfaCookie({
      token: signed?.value,
      userId: "user-b",
      sessionId: "session-a",
    })),
    "TEST 5 token cannot be used for another user",
  );
  assert(
    !(await verifyMfaCookie({
      token: signed?.value,
      userId: "user-a",
      sessionId: "session-b",
    })),
    "TEST 5 token cannot be used for another session",
  );

  // TEST 6: MFA not required
  const notRequired = decideMobileMfaAccess({
    policyRequired: false,
    inspected: emptyInspect,
  });
  assert(notRequired.allow && !notRequired.mfaRequired, "TEST 6 no MFA when policy does not require it");

  // TEST 7: switch to org that requires MFA — skip token is not sufficient
  const skip = await createMfaCookieValue({
    userId: "user-a",
    sessionId: "session-a",
    kind: "policy_skip",
    organizationId: "org-a",
  });
  const skipInspectForA = await inspectMfaCookie({
    token: skip?.value,
    userId: "user-a",
    sessionId: "session-a",
    organizationId: "org-a",
  });
  const skipInspectForB = await inspectMfaCookie({
    token: skip?.value,
    userId: "user-a",
    sessionId: "session-a",
    organizationId: "org-b",
  });
  assert(skipInspectForA.authentic && skipInspectForA.kind === "policy_skip", "skip authentic for org A");
  assert(!skipInspectForB.authentic, "TEST 7 skip token does not transfer to org B");
  const skipAgainstRequired = decideMobileMfaAccess({
    policyRequired: true,
    inspected: skipInspectForA,
  });
  assert(
    !skipAgainstRequired.allow,
    "TEST 7 policy-skip cannot satisfy an organization that requires MFA",
  );
  const verifiedAgainstRequiredOrg = decideMobileMfaAccess({
    policyRequired: true,
    inspected: validInspect,
  });
  assert(verifiedAgainstRequiredOrg.allow, "verified proof works after org switch");

  // TEST 9: production missing dedicated secret does not use CRON/service-role
  await withEnv(
    {
      NODE_ENV: "production",
      MFA_SESSION_SECRET: undefined,
      MFA_CODE_PEPPER: undefined,
      TRUSTED_DEVICE_PEPPER: undefined,
      CRON_SECRET: "cron-must-not-be-used-as-mfa-secret",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-must-not-be-mfa-secret",
    },
    async () => {
      assert(getMfaSessionSecret() === "", "TEST 9 session secret fails closed");
      assert(getMfaCodePepper() === "", "TEST 9 code pepper fails closed");
      assert(getTrustedDevicePepper() === "", "TEST 9 trusted pepper fails closed");
      assert(
        getMfaSessionSecret() !== process.env.CRON_SECRET,
        "TEST 9 does not use CRON_SECRET",
      );
      assert(
        getMfaSessionSecret() !== process.env.SUPABASE_SERVICE_ROLE_KEY,
        "TEST 9 does not use service-role key",
      );
      assert(
        (await createMfaCookieValue({ userId: "user-a", sessionId: "session-a" })) ===
          null,
        "TEST 9 cannot mint a token without MFA_SESSION_SECRET",
      );
    },
  );

  await withEnv(
    {
      NODE_ENV: "production",
      MFA_SESSION_SECRET: "session-secret-must-not-stand-in-for-peppers",
      MFA_CODE_PEPPER: undefined,
      TRUSTED_DEVICE_PEPPER: undefined,
    },
    () => {
      assert(getMfaSessionSecret().length > 0, "session secret is independent");
      assert(getMfaCodePepper() === "", "TEST 9 pepper does not fall back to session secret");
      assert(
        getTrustedDevicePepper() === "",
        "TEST 9 trusted pepper does not fall back to session secret",
      );
    },
  );

  // TEST 11 already covered by skip-against-required above.

  // TEST 12: invalid X-Sanctuary-MFA does not throw
  const garbageInspect = await inspectMfaCookie({
    token: "not-a-token",
    userId: "user-a",
    sessionId: "session-a",
  });
  assert(!garbageInspect.authentic, "TEST 12 garbage token rejected");
  const garbageDecision = decideMobileMfaAccess({
    policyRequired: true,
    inspected: garbageInspect,
  });
  assert(!garbageDecision.allow, "TEST 12 garbage header does not crash and is rejected");

  // TEST 13: expired proof is treated as MFA required (client must re-enter MFA)
  const expiredInspect = await inspectMfaCookie({
    token: expired?.value,
    userId: "user-a",
    sessionId: "session-a",
  });
  const expiredDecision = decideMobileMfaAccess({
    policyRequired: true,
    inspected: expiredInspect,
  });
  assert(
    !expiredDecision.allow && expiredDecision.status === "mfa_required",
    "TEST 13 expired token requires MFA again",
  );

  // TEST 14: a newly issued verified token restores access
  const reissued = await createMfaCookieValue({
    userId: "user-a",
    sessionId: "session-a",
    kind: "verified",
  });
  const reissuedInspect = await inspectMfaCookie({
    token: reissued?.value,
    userId: "user-a",
    sessionId: "session-a",
  });
  const restored = decideMobileMfaAccess({
    policyRequired: true,
    inspected: reissuedInspect,
  });
  assert(restored.allow && restored.mfaSatisfied, "TEST 14 re-MFA restores access");

  // TEST 10: plaintext OTP must not appear in logs, audit metadata, or console sender
  const sanitized = sanitizeAuditMetadata({
    otp: "654321",
    mfa_code: "654321",
    code: "654321",
    channel: "sms",
  });
  assert(sanitized.otp === "[redacted]", "TEST 10 audit otp redacted");
  assert(sanitized.mfa_code === "[redacted]", "TEST 10 audit mfa_code redacted");
  assert(sanitized.code === "[redacted]", "TEST 10 audit 6-digit code redacted");
  assert(sanitized.channel === "sms", "TEST 10 non-secret audit fields kept");

  const sendSmsSource = readFileSync(
    join(process.cwd(), "lib/mfa/send-sms.ts"),
    "utf8",
  );
  assert(
    !sendSmsSource.includes("code: input.code"),
    "TEST 10 console sender does not log the OTP",
  );

  const captured: string[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    captured.push(args.map((value) => String(value)).join(" "));
  };
  try {
    await withEnv({ MFA_SMS_PROVIDER: "console", NODE_ENV: "development" }, async () => {
      const sender = getMfaSmsSender();
      const result = await sender.send({ toE164: "+14255551234", code: "654321" });
      assert(result.ok, "console sender succeeds in development");
    });
  } finally {
    console.info = originalInfo;
  }
  const joined = captured.join("\n");
  assert(!joined.includes("654321"), "TEST 10 console output has no plaintext OTP");
  assert(!/\b\d{6}\b/.test(joined), "TEST 10 console output has no 6-digit code");

  console.log("mfa mobile-gate self-check: ok");
}

void main();
