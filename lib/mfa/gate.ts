import { isMfaEmergencyOverrideActive } from "@/lib/mfa/policy";
import { getMfaReauthRequirement } from "@/lib/mfa/reauth";
import { inspectMfaCookie, verifyMfaCookie } from "@/lib/mfa/session-cookie";

export async function hasSatisfiedLoginMfa(input: {
  userId: string;
  sessionId: string;
  cookieValue: string | undefined;
  organizationId?: string | null;
  platformDestination?: boolean;
}): Promise<boolean> {
  if (isMfaEmergencyOverrideActive()) return true;
  const reauth = await getMfaReauthRequirement({
    organizationId: input.organizationId,
    platformDestination: input.platformDestination,
  });
  return verifyMfaCookie({
    token: input.cookieValue,
    userId: input.userId,
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    platformDestination: input.platformDestination,
    reauthAfterMs: reauth.effectiveAtMs,
  });
}

export async function inspectLoginMfaSatisfaction(input: {
  userId: string;
  sessionId: string;
  cookieValue: string | undefined;
  organizationId?: string | null;
  platformDestination?: boolean;
}) {
  const reauth = await getMfaReauthRequirement({
    organizationId: input.organizationId,
    platformDestination: input.platformDestination,
  });
  const inspected = await inspectMfaCookie({
    token: input.cookieValue,
    userId: input.userId,
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    platformDestination: input.platformDestination,
    reauthAfterMs: reauth.effectiveAtMs,
  });
  return { reauth, inspected };
}
