import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  createMfaChallenge,
  retryAfterSeconds,
  verifyMfaCode,
} from "@/lib/mfa/challenges";
import { maskEmailForMfa, maskPhoneForMfa } from "@/lib/mfa/mask";
import { isMfaLoginEnabled, type MfaChannel } from "@/lib/mfa/policy";
import { resolveLoginSmsDestination } from "@/lib/mfa/phone";
import { sendMfaEmailCode } from "@/lib/mfa/send-email";
import { sendMfaSmsCode, shouldExposeDevMfaCode } from "@/lib/mfa/send-sms";
import {
  getAuthSessionBinding,
} from "@/lib/mfa/session-cookie";
import { writeMfaSessionCookie } from "@/lib/mfa/session";
import {
  getOrCreateUserSecuritySettings,
  loginSmsBackupAvailable,
} from "@/lib/mfa/settings";
import type { LoginMfaView, MfaActionState } from "@/lib/mfa/types";

export function safeMfaNextPath(value: string | null | undefined): string {
  const next = (value ?? "").trim();
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/auth/mfa")) {
    return next;
  }
  return "/home";
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

export async function startLoginEmailChallenge(): Promise<MfaActionState> {
  const ctx = await getLoginMfaContext();
  if (!ctx) return { error: "Sign in with your email and password first." };

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

export async function startLoginSmsChallenge(): Promise<MfaActionState> {
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

  const wrote = await writeMfaSessionCookie({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
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

  return { success: true, verified: true };
}

export async function shouldSkipLoginMfa(): Promise<boolean> {
  if (!isMfaLoginEnabled()) return true;
  const ctx = await getLoginMfaContext();
  if (!ctx) return false;
  const settings = await getOrCreateUserSecuritySettings(ctx.userId);
  return settings.mfaRequired === false;
}
