import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  createMfaChallenge,
  retryAfterSeconds,
  verifyMfaCode,
} from "@/lib/mfa/challenges";
import {
  evaluateMfaPolicy,
  mfaCookieFromPolicy,
  type EffectiveMfaPolicy,
  type MfaPolicyAudience,
} from "@/lib/mfa/effective-policy";
import { inspectLoginMfaSatisfaction } from "@/lib/mfa/gate";
import { maskEmailForMfa, maskPhoneForMfa } from "@/lib/mfa/mask";
import { resolveLoginSmsDestination } from "@/lib/mfa/phone";
import {
  isMfaChannel,
  isMfaEmergencyOverrideActive,
  type MfaChannel,
} from "@/lib/mfa/policy";
import {
  getOrganizationSecuritySettings,
  getPlatformSecuritySettings,
} from "@/lib/mfa/policy-settings";
import { sendMfaEmailCode } from "@/lib/mfa/send-email";
import { sendMfaSmsCode, shouldExposeDevMfaCode } from "@/lib/mfa/send-sms";
import { createMfaCookieValue, getAuthSessionBinding } from "@/lib/mfa/session-cookie";
import {
  getOrCreateUserSecuritySettings,
  loginSmsBackupAvailable,
  markLoginMfaCompleted,
} from "@/lib/mfa/settings";
import type { LoginMfaView } from "@/lib/mfa/types";

export type MobileOrganizationOption = {
  id: string;
  name: string;
};

export type MobileMfaCompletePayload = {
  status: "complete";
  token: string;
  expiresAt: string;
  kind: "verified" | "policy_skip";
  organizationId: string | null;
};

export type MobileMfaResponse =
  | { status: "unauthenticated"; error: string }
  | {
      status: "select_organization";
      organizations: MobileOrganizationOption[];
    }
  | MobileMfaCompletePayload
  | { status: "challenge"; view: LoginMfaView }
  | { status: "error"; error: string; view?: LoginMfaView };

type MobileAuthContext = {
  userId: string;
  email: string;
  sessionId: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function mobileMfaCorsHeaders() {
  return CORS_HEADERS;
}

export async function getMobileAuthContext(
  request: Request,
): Promise<MobileAuthContext | null> {
  const header = request.headers.get("authorization") ?? "";
  const accessToken = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";
  if (!accessToken) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user?.id || !data.user.email) return null;

  return {
    userId: data.user.id,
    email: data.user.email,
    sessionId: getAuthSessionBinding(accessToken, data.user.id),
  };
}

async function listActiveMembershipOrganizationIds(
  userId: string,
): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("mobile listActiveMembershipOrganizationIds failed:", error.message);
    return [];
  }

  return [...new Set((data ?? []).map((row) => String(row.organization_id)))];
}

function resolveOrganizationFromMemberships(input: {
  membershipIds: string[];
  requestedOrganizationId?: string | null;
}): {
  organizationId: string | null;
  membershipIds: string[];
  needsOrganizationSelection: boolean;
  audience: MfaPolicyAudience;
} {
  const requested = input.requestedOrganizationId?.trim() || null;
  if (requested && input.membershipIds.includes(requested)) {
    return {
      organizationId: requested,
      membershipIds: input.membershipIds,
      needsOrganizationSelection: false,
      audience: "organization",
    };
  }

  if (input.membershipIds.length === 1) {
    return {
      organizationId: input.membershipIds[0],
      membershipIds: input.membershipIds,
      needsOrganizationSelection: false,
      audience: "organization",
    };
  }

  if (input.membershipIds.length > 1) {
    return {
      organizationId: null,
      membershipIds: input.membershipIds,
      needsOrganizationSelection: true,
      audience: "unknown",
    };
  }

  return {
    organizationId: null,
    membershipIds: input.membershipIds,
    needsOrganizationSelection: false,
    audience: "unknown",
  };
}

async function getMobileEffectiveMfaPolicy(input: {
  userId: string;
  organizationId?: string | null;
}): Promise<EffectiveMfaPolicy> {
  const envLoginEnabled = !isMfaEmergencyOverrideActive();
  const [platform, membershipIds, userSettings] = await Promise.all([
    getPlatformSecuritySettings().catch(() => ({
      mfaEnabled: true,
      mfaReauthAfter: null,
      updatedAt: null,
      updatedBy: null,
    })),
    listActiveMembershipOrganizationIds(input.userId),
    getOrCreateUserSecuritySettings(input.userId).catch(() => null),
  ]);

  const resolution = resolveOrganizationFromMemberships({
    membershipIds,
    requestedOrganizationId: input.organizationId,
  });

  let organizationMfaEnabled: boolean | null = null;
  if (resolution.organizationId) {
    const org = await getOrganizationSecuritySettings(resolution.organizationId).catch(
      () => null,
    );
    organizationMfaEnabled = org ? org.mfaEnabled : true;
  }

  return evaluateMfaPolicy({
    envLoginEnabled,
    platformMfaEnabled: platform.mfaEnabled,
    organizationMfaEnabled,
    organizationId: resolution.organizationId,
    audience: resolution.audience,
    userMfaRequired: userSettings?.mfaRequired,
    needsOrganizationSelection: resolution.needsOrganizationSelection,
  });
}

export async function listMobileOrganizationsForUser(
  userId: string,
): Promise<MobileOrganizationOption[]> {
  const membershipIds = await listActiveMembershipOrganizationIds(userId);
  if (membershipIds.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id, name, display_name")
    .in("id", membershipIds);

  if (error) {
    console.error("mobile list organizations failed:", error.message);
    return membershipIds.map((id) => ({ id, name: "Church" }));
  }

  const byId = new Map(
    (data ?? []).map((row) => [
      String(row.id),
      String(
        (row as { display_name?: string | null }).display_name ||
          row.name ||
          "Church",
      ),
    ]),
  );

  return membershipIds.map((id) => ({
    id,
    name: byId.get(id) ?? "Church",
  }));
}

async function issueMobileMfaToken(input: {
  userId: string;
  sessionId: string;
  kind?: "verified" | "policy_skip";
  organizationId?: string | null;
  lastMfaAtMs?: number | null;
}): Promise<MobileMfaCompletePayload | { status: "error"; error: string }> {
  const signed = await createMfaCookieValue(input);
  if (!signed) {
    return {
      status: "error",
      error: "Unable to complete verification. Set MFA_SESSION_SECRET on the server.",
    };
  }

  return {
    status: "complete",
    token: signed.value,
    expiresAt: signed.expires.toISOString(),
    kind: input.kind ?? "verified",
    organizationId: input.organizationId ?? null,
  };
}

function buildEmailView(input: {
  email: string;
  smsBackupAvailable: boolean;
  verifiedPhone: string | null;
  retryAfterSeconds: number;
  devCode?: string;
}): LoginMfaView {
  return {
    channel: "email",
    maskedDestination: maskEmailForMfa(input.email),
    smsBackupAvailable: input.smsBackupAvailable,
    smsBackupMaskedPhone: input.verifiedPhone
      ? maskPhoneForMfa(input.verifiedPhone)
      : null,
    retryAfterSeconds: input.retryAfterSeconds,
    devCode: input.devCode,
  };
}

function buildSmsView(input: {
  phone: string;
  retryAfterSeconds: number;
  devCode?: string;
}): LoginMfaView {
  return {
    channel: "sms",
    maskedDestination: maskPhoneForMfa(input.phone),
    smsBackupAvailable: true,
    smsBackupMaskedPhone: maskPhoneForMfa(input.phone),
    retryAfterSeconds: input.retryAfterSeconds,
    devCode: input.devCode,
  };
}

async function writeMobileMfaAudit(input: {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await writeAuditLog(admin, {
    userId: input.userId,
    action: input.action,
    entityType: AuditEntityType.USER,
    entityId: input.userId,
    metadata: { client: "mobile", ...(input.metadata ?? {}) },
  });
}

export async function continueMobileLoginMfa(input: {
  ctx: MobileAuthContext;
  organizationId?: string | null;
  mfaToken?: string | null;
}): Promise<MobileMfaResponse> {
  const policy = await getMobileEffectiveMfaPolicy({
    userId: input.ctx.userId,
    organizationId: input.organizationId,
  });

  if (policy.needsOrganizationSelection) {
    return {
      status: "select_organization",
      organizations: await listMobileOrganizationsForUser(input.ctx.userId),
    };
  }

  const { inspected } = await inspectLoginMfaSatisfaction({
    userId: input.ctx.userId,
    sessionId: input.ctx.sessionId,
    cookieValue: input.mfaToken ?? undefined,
    organizationId: policy.organizationId,
    platformDestination: false,
  });

  if (inspected.authentic && inspected.satisfiesReauth) {
    return issueMobileMfaToken({
      userId: input.ctx.userId,
      sessionId: input.ctx.sessionId,
      kind: inspected.kind ?? "verified",
      organizationId: inspected.organizationId,
      lastMfaAtMs: inspected.lastMfaAtMs || null,
    });
  }

  if (!policy.required) {
    return issueMobileMfaToken({
      userId: input.ctx.userId,
      sessionId: input.ctx.sessionId,
      ...mfaCookieFromPolicy(policy),
    });
  }

  return startMobileLoginChallenge({
    ctx: input.ctx,
    channel: "email",
  });
}

export async function startMobileLoginChallenge(input: {
  ctx: MobileAuthContext;
  channel: MfaChannel;
  organizationId?: string | null;
}): Promise<MobileMfaResponse> {
  const skipped = await continueIfMfaNotRequired(input.ctx, input.organizationId);
  if (skipped) return skipped;

  const settings = await getOrCreateUserSecuritySettings(input.ctx.userId);
  const smsBackupAvailable = loginSmsBackupAvailable(settings);

  if (input.channel === "sms") {
    const phone = resolveLoginSmsDestination(settings.verifiedPhone);
    if (!settings.smsBackupEnabled || !phone) {
      return {
        status: "error",
        error: "Text/SMS backup is not set up for this account. Use the email code.",
        view: buildEmailView({
          email: input.ctx.email,
          smsBackupAvailable: false,
          verifiedPhone: null,
          retryAfterSeconds: 0,
        }),
      };
    }

    const created = await createMfaChallenge({
      userId: input.ctx.userId,
      purpose: "login",
      channel: "sms",
      destination: phone,
    });

    let devCode: string | undefined;
    if (!created.reused) {
      const sent = await sendMfaSmsCode({ toE164: phone, code: created.code });
      if (!sent.ok) {
        return {
          status: "error",
          error: sent.error ?? "Unable to send the Text/SMS.",
          view: buildSmsView({ phone, retryAfterSeconds: 0 }),
        };
      }
      if (shouldExposeDevMfaCode(sent.provider)) {
        devCode = created.code;
      }
      await writeMobileMfaAudit({
        userId: input.ctx.userId,
        action: AuditAction.AUTH_MFA_CHALLENGE_SENT,
        metadata: { channel: "sms", purpose: "login" },
      });
    }

    return {
      status: "challenge",
      view: buildSmsView({
        phone,
        retryAfterSeconds: retryAfterSeconds(created.challenge.createdAt),
        devCode,
      }),
    };
  }

  const created = await createMfaChallenge({
    userId: input.ctx.userId,
    purpose: "login",
    channel: "email",
    destination: input.ctx.email,
  });

  let devCode: string | undefined;
  if (!created.reused) {
    const sent = await sendMfaEmailCode({
      toEmail: input.ctx.email,
      code: created.code,
    });
    if (!sent.ok) {
      return {
        status: "error",
        error: sent.error ?? "Unable to send the verification email.",
        view: buildEmailView({
          email: input.ctx.email,
          smsBackupAvailable,
          verifiedPhone: settings.verifiedPhone,
          retryAfterSeconds: 0,
        }),
      };
    }
    if (shouldExposeDevMfaCode(sent.provider)) {
      devCode = created.code;
    }
    await writeMobileMfaAudit({
      userId: input.ctx.userId,
      action: AuditAction.AUTH_MFA_CHALLENGE_SENT,
      metadata: { channel: "email", purpose: "login" },
    });
  }

  return {
    status: "challenge",
    view: buildEmailView({
      email: input.ctx.email,
      smsBackupAvailable,
      verifiedPhone: settings.verifiedPhone,
      retryAfterSeconds: retryAfterSeconds(created.challenge.createdAt),
      devCode,
    }),
  };
}

export async function verifyMobileLoginMfa(input: {
  ctx: MobileAuthContext;
  channel: MfaChannel;
  code: string;
}): Promise<MobileMfaResponse> {
  const result = await verifyMfaCode({
    userId: input.ctx.userId,
    purpose: "login",
    channel: input.channel,
    code: input.code,
  });

  const settings = await getOrCreateUserSecuritySettings(input.ctx.userId);
  const smsBackupAvailable = loginSmsBackupAvailable(settings);

  if (!result.ok) {
    if (result.locked) {
      await writeMobileMfaAudit({
        userId: input.ctx.userId,
        action: AuditAction.AUTH_MFA_FAILED,
        metadata: { channel: input.channel, locked: true },
      });
    }
    return {
      status: "error",
      error: result.error,
      view:
        input.channel === "sms" && settings.verifiedPhone
          ? buildSmsView({ phone: settings.verifiedPhone, retryAfterSeconds: 0 })
          : buildEmailView({
              email: input.ctx.email,
              smsBackupAvailable,
              verifiedPhone: settings.verifiedPhone,
              retryAfterSeconds: 0,
            }),
    };
  }

  const completedAt = await markLoginMfaCompleted(input.ctx.userId);
  const issued = await issueMobileMfaToken({
    userId: input.ctx.userId,
    sessionId: input.ctx.sessionId,
    lastMfaAtMs: Date.parse(completedAt) || Date.now(),
  });

  if (issued.status !== "complete") return issued;

  await writeMobileMfaAudit({
    userId: input.ctx.userId,
    action: AuditAction.AUTH_MFA_VERIFIED,
    metadata: { channel: input.channel },
  });

  return issued;
}

export function parseMfaChannel(value: unknown): MfaChannel {
  const raw = typeof value === "string" ? value : "email";
  return isMfaChannel(raw) ? raw : "email";
}

async function continueIfMfaNotRequired(
  ctx: MobileAuthContext,
  organizationId?: string | null,
): Promise<MobileMfaResponse | null> {
  const policy = await getMobileEffectiveMfaPolicy({
    userId: ctx.userId,
    organizationId,
  });
  if (policy.needsOrganizationSelection) {
    return {
      status: "select_organization",
      organizations: await listMobileOrganizationsForUser(ctx.userId),
    };
  }
  if (!policy.required) {
    return issueMobileMfaToken({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      ...mfaCookieFromPolicy(policy),
    });
  }
  return null;
}
