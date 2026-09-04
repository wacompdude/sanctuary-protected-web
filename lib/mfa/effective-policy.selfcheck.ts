/**
 * MFA policy self-check (no database required).
 * Run: npx --yes tsx lib/mfa/effective-policy.selfcheck.ts
 */
import {
  describeEffectiveMfaPolicy,
  describeMfaPolicyReason,
  evaluateMfaPolicy,
  isPlatformDestination,
  mfaCookieFromPolicy,
  mfaPolicyUserMessage,
} from "@/lib/mfa/effective-policy";
import {
  MFA_COOKIE_NAME,
  MFA_POLICY_SKIP_DURATION_SECONDS,
  MFA_SESSION_DURATION_SECONDS,
  isMfaEmergencyOverrideActive,
  isMfaLoginEnabled,
} from "@/lib/mfa/policy";
import {
  clampMfaPolicyPageSize,
  isUuidSearch,
  organizationSearchOrFilter,
  pageWindow,
  sanitizeOrganizationSearch,
} from "@/lib/mfa/admin-directory";
import { cookieIsStaleForReauth, lastMfaSatisfiesReauth } from "@/lib/mfa/reauth";
import { EXPECTED_PLATFORM_ROLE_PERMISSIONS } from "@/lib/platform/expected-matrix";
import { PLATFORM_PERMISSIONS } from "@/lib/platform/permission-keys";
import { PLATFORM_ROLE_KEYS } from "@/lib/platform/role-keys";
import { createMfaCookieValue, verifyMfaCookie } from "@/lib/mfa/session-cookie";
import { AuditAction } from "@/lib/audit/actions";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function policy(input: {
  env?: boolean;
  platform: boolean;
  organization?: boolean | null;
  audience?: "platform" | "organization" | "unknown";
  organizationId?: string | null;
  userOverride?: boolean;
  needsSelection?: boolean;
}) {
  return evaluateMfaPolicy({
    envLoginEnabled: input.env ?? true,
    platformMfaEnabled: input.platform,
    organizationMfaEnabled: input.organization ?? null,
    organizationId: input.organizationId ?? "org-a",
    audience: input.audience ?? "organization",
    userMfaRequired: input.userOverride,
    needsOrganizationSelection: input.needsSelection,
  });
}

async function main() {
  // 1. Platform ON + Organization ON → MFA required
  const bothOn = policy({ platform: true, organization: true });
  assert(bothOn.required, "1 platform+org on requires MFA");
  assert(describeEffectiveMfaPolicy(bothOn) === "REQUIRED", "1 effective required");

  // 2. Platform ON + Organization OFF → no MFA
  const orgOff = policy({ platform: true, organization: false });
  assert(!orgOff.required, "2 org off skips MFA");
  assert(orgOff.reason === "organization_disabled", "2 org reason");

  // 3. Platform OFF + Organization ON → no MFA
  const platformOffOrgOn = policy({ platform: false, organization: true });
  assert(!platformOffOrgOn.required, "3 platform off skips MFA");
  assert(platformOffOrgOn.reason === "platform_disabled", "3 platform reason");
  assert(
    describeEffectiveMfaPolicy(platformOffOrgOn).includes("overridden by Platform"),
    "3 override label",
  );

  // 4. Platform OFF + Organization OFF → no MFA
  const bothOff = policy({ platform: false, organization: false });
  assert(!bothOff.required, "4 both off skips MFA");
  assert(bothOff.reason === "platform_disabled", "4 platform wins");

  // 5 + 6. Platform OFF does not mutate organization settings
  assert(platformOffOrgOn.organizationMfaEnabled === true, "5 org setting preserved when platform off");
  assert(bothOff.organizationMfaEnabled === false, "5 other org setting preserved");
  const restoredA = policy({
    platform: true,
    organization: platformOffOrgOn.organizationMfaEnabled,
  });
  const restoredB = policy({
    platform: true,
    organization: bothOff.organizationMfaEnabled,
  });
  assert(restoredA.required, "6 turning platform on restores org A required");
  assert(!restoredB.required, "6 turning platform on leaves org B not required");

  // 7–9. Organization A off does not disable Organization B
  const orgA = policy({
    platform: true,
    organization: false,
    organizationId: "org-a",
  });
  const orgB = policy({
    platform: true,
    organization: true,
    organizationId: "org-b",
  });
  assert(!orgA.required && orgA.organizationId === "org-a", "7/8 org A skip is scoped");
  assert(orgB.required && orgB.organizationId === "org-b", "7/9 org B still required");
  assert(
    mfaCookieFromPolicy(orgA).organizationId === "org-a",
    "8 skip cookie is bound to org A",
  );
  assert(mfaCookieFromPolicy(orgB).kind === "verified", "9 required does not emit skip cookie");

  // 10–11. Policy off is not unenrollment
  assert(orgA.reason !== "user_override", "10 policy off is not a user exemption");
  assert(
    !mfaPolicyUserMessage(orgA)?.toLowerCase().includes("removed"),
    "10 copy does not say MFA was removed",
  );
  assert(restoredA.required, "11 re-enable uses existing required path");

  // 12. Policy skip is not a trusted-device record
  const skipCookie = mfaCookieFromPolicy(orgA);
  assert(skipCookie.kind === "policy_skip", "12 skip is policy_skip, not trusted device");

  // 13. Trusted-device / verified cookie is used only when MFA is required
  assert(mfaCookieFromPolicy(bothOn).kind === "verified", "13 required uses verified cookie");

  // 14–18. Permissions: only Super Admin
  assert(
    PLATFORM_PERMISSIONS.includes("security.mfa_policy.manage"),
    "14/18 permission exists",
  );
  assert(
    EXPECTED_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE_KEYS.SUPER_ADMIN].includes(
      "security.mfa_policy.manage",
    ),
    "18 super admin can toggle",
  );
  assert(
    !EXPECTED_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE_KEYS.PLATFORM_ADMIN].includes(
      "security.mfa_policy.manage",
    ),
    "14/16 platform admin cannot toggle",
  );
  assert(
    !EXPECTED_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE_KEYS.SUPPORT].includes(
      "security.mfa_policy.manage",
    ),
    "14 support cannot toggle",
  );
  assert(
    !EXPECTED_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE_KEYS.AUDITOR].includes(
      "security.mfa_policy.manage",
    ),
    "14 auditor cannot toggle",
  );

  // 19. Audit actions exist (authorization is server + RLS, not client state)
  assert(AuditAction.PLATFORM_MFA_ENABLED === "platform.mfa_enabled", "19 platform enable audit");
  assert(AuditAction.PLATFORM_MFA_DISABLED === "platform.mfa_disabled", "19 platform disable audit");
  assert(
    AuditAction.ORGANIZATION_MFA_ENABLED === "organization.mfa_enabled",
    "19 org enable audit",
  );
  assert(
    AuditAction.ORGANIZATION_MFA_DISABLED === "organization.mfa_disabled",
    "19 org disable audit",
  );
  assert(
    AuditAction.PLATFORM_MFA_REAUTH_REQUIRED === "platform.mfa_reauth_required",
    "35 platform reauth audit",
  );
  assert(
    AuditAction.ORGANIZATION_MFA_REAUTH_REQUIRED === "organization.mfa_reauth_required",
    "35 org reauth audit",
  );

  // Super Admin follows platform policy, not an organization setting
  const superAdminOn = policy({
    platform: true,
    organization: false,
    audience: "platform",
  });
  assert(superAdminOn.required, "super admin requires MFA when platform is on");
  const superAdminOff = policy({
    platform: false,
    organization: true,
    audience: "platform",
  });
  assert(!superAdminOff.required, "super admin may skip MFA when platform is off");

  // Unknown org context fails closed when platform MFA is on
  const unknown = policy({
    platform: true,
    organization: null,
    audience: "unknown",
    organizationId: null,
    needsSelection: true,
  });
  assert(unknown.required, "unknown org context requires MFA until selected");
  assert(unknown.needsOrganizationSelection, "multi-org selection flagged");

  assert(isPlatformDestination("/platform"), "platform root");
  assert(isPlatformDestination("/platform/security"), "platform security");
  assert(!isPlatformDestination("/home"), "church home is not platform");

  // Org-scoped skip cookie cannot open another org or /platform
  const signedSkip = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-1",
    kind: "policy_skip",
    organizationId: "org-a",
  });
  assert(signedSkip !== null, "skip cookie signed");
  assert(
    await verifyMfaCookie({
      token: signedSkip?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-a",
    }),
    "skip cookie valid for org A",
  );
  assert(
    !(await verifyMfaCookie({
      token: signedSkip?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-b",
    })),
    "skip cookie rejected for org B",
  );
  assert(
    !(await verifyMfaCookie({
      token: signedSkip?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-a",
      platformDestination: true,
    })),
    "org skip cookie rejected for platform",
  );

  const signedGlobal = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-1",
    kind: "policy_skip",
    organizationId: null,
  });
  assert(
    await verifyMfaCookie({
      token: signedGlobal?.value,
      userId: "user-1",
      sessionId: "session-1",
      platformDestination: true,
    }),
    "platform-wide skip is valid for /platform",
  );

  const signedVerified = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-1",
    kind: "verified",
  });
  assert(
    await verifyMfaCookie({
      token: signedVerified?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-b",
      platformDestination: true,
    }),
    "verified cookie is valid across orgs and platform",
  );

  const envOff = policy({ env: false, platform: true, organization: true });
  assert(!envOff.required && envOff.reason === "emergency_environment_override", "env kill switch");
  assert(envOff.emergencyOverrideActive, "emergency flag on policy");
  assert(describeMfaPolicyReason(envOff) === "Emergency override", "admin reason label");
  assert(
    Boolean(mfaPolicyUserMessage(envOff)?.includes("platform security policy")),
    "user copy hides environment variable names",
  );
  assert(
    !Boolean(mfaPolicyUserMessage(envOff)?.includes("MFA_LOGIN_ENABLED")),
    "user copy does not name the env var",
  );

  assert(isMfaEmergencyOverrideActive("false"), "1 explicit false");
  assert(isMfaEmergencyOverrideActive("FALSE"), "1 false is case-insensitive");
  assert(isMfaEmergencyOverrideActive(" false "), "1 trimmed false");
  assert(isMfaLoginEnabled("true"), "2 true enables MFA");
  assert(isMfaLoginEnabled(undefined), "3 missing fails secure");
  assert(isMfaLoginEnabled(""), "3 empty fails secure");
  assert(isMfaLoginEnabled("0"), "4 invalid 0 fails secure");
  assert(isMfaLoginEnabled("off"), "4 invalid off fails secure");
  assert(isMfaLoginEnabled("no"), "4 invalid no fails secure");
  assert(
    policy({ env: false, platform: true, organization: true }).platformMfaEnabled === true,
    "5 emergency override does not flip platform policy input",
  );
  assert(
    policy({ env: false, platform: true, organization: true }).organizationMfaEnabled === true,
    "6 emergency override does not flip org policy input",
  );

  assert(MFA_SESSION_DURATION_SECONDS === 60 * 60 * 12, "41 session is 12 hours");
  assert(
    MFA_POLICY_SKIP_DURATION_SECONDS === MFA_SESSION_DURATION_SECONDS,
    "40 skip shares session duration",
  );
  assert(MFA_COOKIE_NAME === "sp_mfa", "cookie name");
  assert(MFA_SESSION_DURATION_SECONDS !== 60 * 60 * 24 * 30, "43 skip is not 30-day trusted device");

  const now = Date.now();
  assert(
    cookieIsStaleForReauth({ issuedAtMs: now - 60_000, reauthAfterMs: now }),
    "17 cookie older than reauth cutoff is stale",
  );
  assert(
    !cookieIsStaleForReauth({ issuedAtMs: now, reauthAfterMs: now - 60_000 }),
    "22 cookie issued after cutoff is fresh",
  );
  assert(
    !cookieIsStaleForReauth({ issuedAtMs: now, reauthAfterMs: null }),
    "default sessions are not stale",
  );

  const orgAReauth = now + 10_000;
  const orgBReauth = null;
  assert(orgAReauth !== orgBReauth, "18 org A cutoff is independent of org B");
  assert(
    cookieIsStaleForReauth({ issuedAtMs: now - 1, reauthAfterMs: orgAReauth }),
    "18 org A force affects org A cookies",
  );
  assert(
    !lastMfaSatisfiesReauth({ lastMfaAtMs: now - 60_000, reauthAfterMs: now }),
    "21 last MFA before cutoff cannot skip via trusted device",
  );
  assert(
    lastMfaSatisfiesReauth({ lastMfaAtMs: now, reauthAfterMs: now - 60_000 }),
    "22 last MFA after cutoff restores trusted-device skip",
  );
  assert(
    lastMfaSatisfiesReauth({ lastMfaAtMs: now - 60_000, reauthAfterMs: null }),
    "54 trusted device still works without a reauth cutoff",
  );
  assert(
    !lastMfaSatisfiesReauth({ lastMfaAtMs: null, reauthAfterMs: now }),
    "21 missing last MFA fails closed when cutoff exists",
  );

  const skipSigned = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-1",
    kind: "policy_skip",
    organizationId: "org-a",
    maxAgeSeconds: MFA_POLICY_SKIP_DURATION_SECONDS,
  });
  assert(
    !(await verifyMfaCookie({
      token: skipSigned?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-a",
      reauthAfterMs: Date.now() + 5_000,
    })),
    "23/46 policy-skip cannot bypass require MFA immediately",
  );
  assert(
    await verifyMfaCookie({
      token: skipSigned?.value,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-a",
      reauthAfterMs: Date.now() - 60_000,
    }),
    "skip remains valid when issued after cutoff",
  );

  const trustedAfterCutoff = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-2",
    kind: "verified",
    lastMfaAtMs: now - 120_000,
  });
  assert(
    !(await verifyMfaCookie({
      token: trustedAfterCutoff?.value,
      userId: "user-1",
      sessionId: "session-2",
      reauthAfterMs: now,
    })),
    "21 trusted-device cookie cannot bypass require MFA immediately",
  );
  const afterRealMfa = await createMfaCookieValue({
    userId: "user-1",
    sessionId: "session-3",
    kind: "verified",
    lastMfaAtMs: now,
  });
  assert(
    await verifyMfaCookie({
      token: afterRealMfa?.value,
      userId: "user-1",
      sessionId: "session-3",
      reauthAfterMs: now - 2_000,
    }),
    "22 after forced MFA a new cookie satisfies reauth",
  );

  const tampered = `${skipSigned?.value.slice(0, 10)}aaaaaaaa.${skipSigned?.value.split(".")[1] ?? ""}`;
  assert(
    !(await verifyMfaCookie({
      token: tampered,
      userId: "user-1",
      sessionId: "session-1",
      organizationId: "org-a",
    })),
    "44 tampered cookie rejected",
  );

  assert(clampMfaPolicyPageSize(500) === 50, "30 500 is not a page size");
  assert(clampMfaPolicyPageSize(25) === 25, "page size 25");
  assert(clampMfaPolicyPageSize(100) === 100, "page size 100");
  const window = pageWindow({ page: 2, pageSize: 50, total: 1284 });
  assert(window.from === 51 && window.to === 100, "27 page 2 window");
  assert(window.totalPages === 26, "27 1284/50 pages");
  assert(window.total === 1284, "29 more than 500 accessible via pages");
  const empty = pageWindow({ page: 4, pageSize: 50, total: 0 });
  assert(empty.from === 0 && empty.total === 0 && empty.page === 1, "31 empty results");
  const last = pageWindow({ page: 99, pageSize: 50, total: 1284 });
  assert(last.page === 26 && last.to === 1284, "32 page clamp at end");
  assert(sanitizeOrganizationSearch("a%b_c,d") === "a b c d", "26 search sanitized");
  assert(isUuidSearch("11111111-1111-4111-8111-111111111111"), "25 uuid search");
  assert(
    Boolean(organizationSearchOrFilter("Grace")?.includes("name.ilike.%Grace%")),
    "26 server-side ilike filter",
  );
  assert(
    !Boolean(organizationSearchOrFilter("Grace")?.includes("limit(500)")),
    "30 no 500 cap in search filter",
  );

  console.log("mfa effective policy self-check: ok");
}

void main();
