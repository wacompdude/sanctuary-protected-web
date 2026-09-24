import type { InspectMfaCookieResult } from "@/lib/mfa/session-cookie";

/** Mobile clients send the signed MFA token in this header. Server-only secret. */
export const MOBILE_MFA_HEADER = "x-sanctuary-mfa";

export type MobileMfaRequiredBody = {
  status: "mfa_required";
  error: string;
};

export const MOBILE_MFA_REQUIRED_BODY: MobileMfaRequiredBody = {
  status: "mfa_required",
  error: "Additional verification is required before continuing.",
};

export type MobileMfaAccessDecision =
  | { allow: true; mfaRequired: boolean; mfaSatisfied: boolean }
  | {
      allow: false;
      status: "mfa_required";
      mfaRequired: true;
      mfaSatisfied: false;
    };

/**
 * Policy first, then cryptographic MFA proof.
 * A policy-skip token cannot satisfy an organization that currently requires MFA.
 */
export function decideMobileMfaAccess(input: {
  policyRequired: boolean;
  inspected: Pick<
    InspectMfaCookieResult,
    "authentic" | "satisfiesReauth" | "kind"
  >;
}): MobileMfaAccessDecision {
  if (!input.policyRequired) {
    return { allow: true, mfaRequired: false, mfaSatisfied: true };
  }

  if (
    input.inspected.authentic &&
    input.inspected.satisfiesReauth &&
    input.inspected.kind === "verified"
  ) {
    return { allow: true, mfaRequired: true, mfaSatisfied: true };
  }

  return {
    allow: false,
    status: "mfa_required",
    mfaRequired: true,
    mfaSatisfied: false,
  };
}

export function readMobileMfaToken(request: Request): string | undefined {
  const header = request.headers.get(MOBILE_MFA_HEADER)?.trim();
  return header || undefined;
}
