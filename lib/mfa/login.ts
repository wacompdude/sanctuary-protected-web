import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  createMfaChallenge,
  retryAfterSeconds,
  verifyMfaCode,
} from "@/lib/mfa/challenges";
import { maskEmailForMfa, maskPhoneForMfa } from "@/lib/mfa/mask";
import { isMfaEmergencyOverrideActive, isMfaLoginEnabled, type MfaChannel } from "@/lib/mfa/policy";
import { inspectLoginMfaSatisfaction } from "@/lib/mfa/gate";
import { isPlatformDestination, mfaCookieFromPolicy } from "@/lib/mfa/effective-policy";
import { readMfaCookieValue, writeMfaSessionCookie } from "@/lib/mfa/session";
import { getAuthSessionBinding } from "@/lib/mfa/session-cookie";
import { getEffectiveMfaPolicy } from "@/lib/mfa/resolve-policy";
import { resolveLoginSmsDestination } from "@/lib/mfa/phone";
import { sendMfaEmailCode } from "@/lib/mfa/send-email";
import { sendMfaSmsCode, shouldExposeDevMfaCode } from "@/lib/mfa/send-sms";
import { readActiveOrganizationCookie } from "@/lib/organization/cookie";
import {
  getOrCreateUserSecuritySettings,
  loginSmsBackupAvailable,
  markLoginMfaCompleted,
} from "@/lib/mfa/settings";
import {
  getMfaReauthRequirement,
  lastMfaSatisfiesReauth,
} from "@/lib/mfa/reauth";
import { timestampToMs } from "@/lib/mfa/policy-settings";
import {
  createTrustedDevice,
  recordDeviceVerificationSucceeded,
  recordTrustedDeviceUsed,
  updateTrustedDeviceLastUsed,
  validateTrustedDevice,
} from "@/lib/mfa/trusted-devices";
import {
  readTrustedDeviceCookieValue,
  writeTrustedDeviceCookie,
} from "@/lib/mfa/trusted-device-session";
import type { LoginMfaView, MfaActionState } from "@/lib/mfa/types";

export function safeMfaNextPath(value: string | null | undefined): string {
  const next = (value ?? "").trim();
  if (
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/auth/mfa") &&
    !next.startsWith("/auth/select-organization")
  ) {
    return next;
  }
  return "/home";
}

export function loginMfaResumePath(nextPath: string): string {
  return `/auth/mfa/continue?next=${encodeURIComponent(safeMfaNextPath(nextPath))}`;
}

export async function getLoginMfaContext(): Promise<{
  userId: string;
  email: string;
  sessionId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    userId: user.id,
    email: user.email,
    sessionId: getAuthSessionBinding(session?.access_token, user.id),
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

export async function isForcedReauthPending(pathname?: string | null): Promise<boolean> {
  const ctx = await getLoginMfaContext();
  if (!ctx) return false;
  const existing = await readMfaCookieValue();
  if (!existing) return false;
  const { inspected } = await inspectLoginMfaSatisfaction({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    cookieValue: existing,
    organizationId: await readActiveOrganizationCookie(),
    platformDestination: isPlatformDestination(pathname),
  });
  return inspected.staleDueToReauth;
}

async function completeLoginIfPolicyAllows(
  pathname?: string | null,
): Promise<MfaActionState | null> {
  const ctx = await getLoginMfaContext();
  if (!ctx) return { error: "Sign in with your email and password first." };
  const policy = await getEffectiveMfaPolicy({
    userId: ctx.userId,
    pathname,
  });
  if (policy.needsOrganizationSelection) {
    return { error: "Select a church before verification." };
  }
  if (!policy.required) {
    const wrote = await writeMfaSessionCookie({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      ...mfaCookieFromPolicy(policy),
    });
    if (wrote) return { success: true, verified: true };
  }
  return null;
}

export async function startLoginEmailChallenge(
  pathname?: string | null,
): Promise<MfaActionState> {
  const skipped = await completeLoginIfPolicyAllows(pathname);
  if (skipped) return skipped;

  const ctx = await getLoginMfaContext();
  if (!ctx) return { error: "Sign in with your email and password first." };

  const trustedCookie = await readTrustedDeviceCookieValue();
  if (
    await tryCompleteLoginWithTrustedDevice({
      cookieValue: trustedCookie,
      pathname,
    })
  ) {
    return { success: true, verified: true };
  }

  const settings = await getOrCreateUserSecuritySettings(ctx.userId);
  const smsBackupAvailable = loginSmsBackupAvailable(settings);
  const created = await createMfaChallenge({
    userId: ctx.userId,
    purpose: "login",
    channel: "email",
    destination: ctx.email,
  });

  let devCode: string | undefined;
  if (!created.reused) {
    const sent = await sendMfaEmailCode({
      toEmail: ctx.email,
      code: created.code,
    });
    if (!sent.ok) {
      return {
        error: sent.error ?? "Unable to send the verification email.",
        view: buildEmailView({
          email: ctx.email,
          smsBackupAvailable,
          verifiedPhone: settings.verifiedPhone,
          retryAfterSeconds: 0,
        }),
      };
    }
    if (shouldExposeDevMfaCode(sent.provider)) {
      devCode = created.code;
    }
    const supabase = await createClient();
    await writeAuditLog(supabase, {
      userId: ctx.userId,
      action: AuditAction.AUTH_MFA_CHALLENGE_SENT,
      entityType: AuditEntityType.USER,
      entityId: ctx.userId,
      metadata: { channel: "email", purpose: "login" },
    });
  }

  return {
    success: true,
    view: buildEmailView({
      email: ctx.email,
      smsBackupAvailable,
      verifiedPhone: settings.verifiedPhone,
      retryAfterSeconds: retryAfterSeconds(created.challenge.createdAt),
      devCode,
    }),
  };
}

export async function startLoginSmsChallenge(
  pathname?: string | null,
): Promise<MfaActionState> {
  const skipped = await completeLoginIfPolicyAllows(pathname);
  if (skipped) return skipped;

  const ctx = await getLoginMfaContext();
  if (!ctx) return { error: "Sign in with your email and password first." };

  const settings = await getOrCreateUserSecuritySettings(ctx.userId);
  const phone = resolveLoginSmsDestination(settings.verifiedPhone);
  if (!settings.smsBackupEnabled || !phone) {
    return {
      error:
        "Text message backup is not set up for this account. Use the email code.",
      view: buildEmailView({
        email: ctx.email,
        smsBackupAvailable: false,
        verifiedPhone: null,
        retryAfterSeconds: 0,
      }),
    };
  }

  const created = await createMfaChallenge({
    userId: ctx.userId,
    purpose: "login",
    channel: "sms",
    destination: phone,
  });

  let devCode: string | undefined;
  if (!created.reused) {
    const sent = await sendMfaSmsCode({ toE164: phone, code: created.code });
    if (!sent.ok) {
      return {
        error: sent.error ?? "Unable to send the text message.",
        view: buildSmsView({
          phone,
          retryAfterSeconds: 0,
        }),
      };
    }
    if (shouldExposeDevMfaCode(sent.provider)) {
      devCode = created.code;
    }
    const supabase = await createClient();
    await writeAuditLog(supabase, {
      userId: ctx.userId,
      action: AuditAction.AUTH_MFA_CHALLENGE_SENT,
      entityType: AuditEntityType.USER,
      entityId: ctx.userId,
      metadata: { channel: "sms", purpose: "login" },
    });
  }

  return {
    success: true,
    view: buildSmsView({
      phone,
      retryAfterSeconds: retryAfterSeconds(created.challenge.createdAt),
      devCode,
    }),
  };
}

export async function verifyLoginMfaCode(input: {
  channel: MfaChannel;
  code: string;
  trustDevice?: boolean;
}): Promise<MfaActionState> {
  const ctx = await getLoginMfaContext();
  if (!ctx) return { error: "Sign in with your email and password first." };

  const result = await verifyMfaCode({
    userId: ctx.userId,
    purpose: "login",
    channel: input.channel,
    code: input.code,
  });

  const settings = await getOrCreateUserSecuritySettings(ctx.userId);
  const smsBackupAvailable = loginSmsBackupAvailable(settings);

  if (!result.ok) {
    const supabase = await createClient();
    if (result.locked) {
      await writeAuditLog(supabase, {
        userId: ctx.userId,
        action: AuditAction.AUTH_MFA_FAILED,
        entityType: AuditEntityType.USER,
        entityId: ctx.userId,
        metadata: { channel: input.channel, locked: true },
      });
    }
    return {
      error: result.error,
      fieldErrors: { code: result.error },
      view:
        input.channel === "sms" && settings.verifiedPhone
          ? buildSmsView({ phone: settings.verifiedPhone, retryAfterSeconds: 0 })
          : buildEmailView({
              email: ctx.email,
              smsBackupAvailable,
              verifiedPhone: settings.verifiedPhone,
              retryAfterSeconds: 0,
            }),
    };
  }

  const completedAt = await markLoginMfaCompleted(ctx.userId);
  const lastMfaAtMs = Date.parse(completedAt) || Date.now();
  const wrote = await writeMfaSessionCookie({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    lastMfaAtMs,
  });
  if (!wrote) {
    return {
      error:
        "Unable to complete verification. Set MFA_SESSION_SECRET on the server.",
    };
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    userId: ctx.userId,
    action: AuditAction.AUTH_MFA_VERIFIED,
    entityType: AuditEntityType.USER,
    entityId: ctx.userId,
    metadata: { channel: input.channel },
  });

  let trustedDeviceRegistered = false;
  if (input.trustDevice) {
    const created = await createTrustedDevice({
      userId: ctx.userId,
      userAgent: await readRequestUserAgent(),
    });
    if (created.ok) {
      await writeTrustedDeviceCookie({
        deviceId: created.device.deviceId,
        token: created.token,
        expiresAt: new Date(created.device.expiresAt),
      });
      trustedDeviceRegistered = true;
    } else {
      console.error("Trusted device registration failed:", created.error);
    }
  }

  await recordDeviceVerificationSucceeded(ctx.userId, trustedDeviceRegistered);

  return { success: true, verified: true, trustedDeviceRegistered };
}

export async function shouldSkipLoginMfa(
  pathname?: string | null,
): Promise<boolean> {
  if (!isMfaLoginEnabled()) return true;
  const ctx = await getLoginMfaContext();
  if (!ctx) return false;
  const policy = await getEffectiveMfaPolicy({
    userId: ctx.userId,
    pathname,
  });
  if (policy.needsOrganizationSelection) return false;
  return !policy.required;
}

export async function tryCompleteLoginWithTrustedDevice(input: {
  cookieValue: string | undefined;
  forceFreshMfa?: boolean;
  pathname?: string | null;
  organizationId?: string | null;
}): Promise<boolean> {
  if (isMfaEmergencyOverrideActive()) return false;
  if (input.forceFreshMfa) return false;
  const ctx = await getLoginMfaContext();
  if (!ctx) return false;

  const organizationId =
    input.organizationId?.trim() || (await readActiveOrganizationCookie());
  const reauth = await getMfaReauthRequirement({
    organizationId,
    platformDestination: isPlatformDestination(input.pathname),
  });
  const settings = await getOrCreateUserSecuritySettings(ctx.userId);
  const lastMfaAtMs = timestampToMs(settings.lastLoginMfaAt);
  if (
    !lastMfaSatisfiesReauth({
      lastMfaAtMs,
      reauthAfterMs: reauth.effectiveAtMs,
    })
  ) {
    return false;
  }

  const validated = await validateTrustedDevice({
    userId: ctx.userId,
    cookieValue: input.cookieValue,
  });
  if (!validated.ok) return false;

  const wrote = await writeMfaSessionCookie({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    lastMfaAtMs,
  });
  if (!wrote) return false;

  await updateTrustedDeviceLastUsed(validated.device.id);
  await recordTrustedDeviceUsed({
    userId: ctx.userId,
    deviceRecordId: validated.device.id,
    browser: validated.device.browser,
    operatingSystem: validated.device.operatingSystem,
  });
  return true;
}

async function readRequestUserAgent(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    return headerStore.get("user-agent");
  } catch {
    return null;
  }
}
