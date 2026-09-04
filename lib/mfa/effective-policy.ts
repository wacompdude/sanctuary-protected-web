/**
 * Authoritative MFA policy evaluation.
 *
 * MFA enrolled (phone, trusted devices) is separate from MFA required.
 * Disabling policy never deletes enrollments or trusted devices.
 *
 * Precedence:
 *   1. Emergency environment override (MFA_LOGIN_ENABLED=false)
 *   2. Platform MFA policy
 *   3. Organization MFA policy (ignored for /platform Super Admin destinations)
 *   4. Required → existing MFA / trusted-device workflow
 *
 * Immediate reauthentication is not part of this function. It is applied
 * when validating the current MFA session cookie against mfa_reauth_after.
 */

export type MfaPolicyAudience = "platform" | "organization" | "unknown";

export type MfaPolicyReason =
  | "emergency_environment_override"
  | "platform_disabled"
  | "organization_disabled"
  | "user_override"
  | "required";

export type EffectiveMfaPolicy = {
  required: boolean;
  effectivePolicy: "required" | "not_required";
  platformMfaEnabled: boolean;
  organizationMfaEnabled: boolean | null;
  organizationId: string | null;
  audience: MfaPolicyAudience;
  reason: MfaPolicyReason;
  needsOrganizationSelection: boolean;
  emergencyOverrideActive: boolean;
};

export type EvaluateMfaPolicyInput = {
  envLoginEnabled: boolean;
  platformMfaEnabled: boolean;
  organizationMfaEnabled: boolean | null;
  organizationId?: string | null;
  audience: MfaPolicyAudience;
  userMfaRequired?: boolean;
  needsOrganizationSelection?: boolean;
};

export function isPlatformDestination(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").trim();
  return path === "/platform" || path.startsWith("/platform/");
}

function buildResult(
  input: EvaluateMfaPolicyInput,
  required: boolean,
  reason: MfaPolicyReason,
  extras?: Partial<EffectiveMfaPolicy>,
): EffectiveMfaPolicy {
  return {
    required,
    effectivePolicy: required ? "required" : "not_required",
    platformMfaEnabled: input.platformMfaEnabled,
    organizationMfaEnabled: input.organizationMfaEnabled,
    organizationId: input.organizationId ?? null,
    audience: extras?.audience ?? input.audience,
    reason,
    needsOrganizationSelection:
      extras?.needsOrganizationSelection ?? Boolean(input.needsOrganizationSelection),
    emergencyOverrideActive: !input.envLoginEnabled,
  };
}

export function evaluateMfaPolicy(input: EvaluateMfaPolicyInput): EffectiveMfaPolicy {
  if (!input.envLoginEnabled) {
    return buildResult(input, false, "emergency_environment_override");
  }

  if (!input.platformMfaEnabled) {
    return buildResult(
      { ...input, platformMfaEnabled: false },
      false,
      "platform_disabled",
    );
  }

  if (input.audience === "platform") {
    return buildResult(input, true, "required", {
      audience: "platform",
      needsOrganizationSelection: false,
    });
  }

  if (input.audience === "organization" && input.organizationMfaEnabled === false) {
    return buildResult(
      { ...input, organizationMfaEnabled: false },
      false,
      "organization_disabled",
      { audience: "organization" },
    );
  }

  if (input.userMfaRequired === false) {
    return buildResult(input, false, "user_override");
  }

  return buildResult(input, true, "required");
}

export function describeEffectiveMfaPolicy(policy: EffectiveMfaPolicy): string {
  if (policy.reason === "emergency_environment_override") {
    return "NOT REQUIRED — emergency environment override";
  }
  if (policy.reason === "platform_disabled") {
    return "NOT REQUIRED — overridden by Platform setting";
  }
  if (policy.reason === "organization_disabled") {
    return "NOT REQUIRED";
  }
  if (policy.reason === "user_override") {
    return "NOT REQUIRED — user policy override";
  }
  return "REQUIRED";
}

/** Compact reason label for Super Admin tables. */
export function describeMfaPolicyReason(policy: EffectiveMfaPolicy): string {
  switch (policy.reason) {
    case "emergency_environment_override":
      return "Emergency override";
    case "platform_disabled":
      return "Platform override";
    case "organization_disabled":
      return "Organization disabled";
    case "user_override":
      return "User policy override";
    case "required":
      return policy.audience === "platform" ? "Platform policy" : "Organization policy";
    default:
      return policy.reason;
  }
}

export type MfaAssuranceKind = "verified" | "policy_skip";

/**
 * Cookie scope written after a policy skip.
 * Platform-wide skip (no organization id) is valid everywhere, including
 * /platform. Organization skip is valid only for that organization.
 *
 * Lifetime matches MFA_SESSION_DURATION_SECONDS (~12 hours).
 * This is not a trusted-device credential.
 */
export function mfaCookieFromPolicy(policy: EffectiveMfaPolicy): {
  kind: MfaAssuranceKind;
  organizationId: string | null;
} {
  if (policy.required) {
    return { kind: "verified", organizationId: null };
  }
  if (policy.reason === "organization_disabled" && policy.organizationId) {
    return { kind: "policy_skip", organizationId: policy.organizationId };
  }
  return { kind: "policy_skip", organizationId: null };
}

export function mfaPolicyUserMessage(policy: EffectiveMfaPolicy): string | null {
  if (policy.required) return null;
  if (
    policy.reason === "platform_disabled" ||
    policy.reason === "emergency_environment_override"
  ) {
    return "Multi-factor authentication is currently not required by the platform security policy.";
  }
  if (policy.reason === "organization_disabled") {
    return "Multi-factor authentication is currently not required by your organization's security policy.";
  }
  return "Multi-factor authentication is currently not required by security policy.";
}
