import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  createMfaChallenge,
  retryAfterSeconds,
  verifyMfaCode,
} from "@/lib/mfa/challenges";
import { maskPhoneForMfa } from "@/lib/mfa/mask";
import { toVerifiedPhoneE164 } from "@/lib/mfa/phone";
import { sendMfaSmsCode, shouldExposeDevMfaCode } from "@/lib/mfa/send-sms";
import {
  clearVerifiedPhone,
  getOrCreateUserSecuritySettings,
  setVerifiedPhone,
} from "@/lib/mfa/settings";
import { requirePasswordStepUp } from "@/lib/mfa/step-up";
import type { MfaActionState } from "@/lib/mfa/types";

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function startPhoneEnrollment(
  phoneInput: string,
  currentPassword?: string,
): Promise<MfaActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "You must be signed in." };

  const settings = await getOrCreateUserSecuritySettings(userId);
  if (settings.verifiedPhone) {
    const stepUp = await requirePasswordStepUp(currentPassword ?? "");
    if (!stepUp.ok) {
      return {
        error: stepUp.error,
        fieldErrors: stepUp.fieldErrors,
      };
    }
  }

  const phone = toVerifiedPhoneE164(phoneInput);
  if (!phone) {
    return {
      error: "Enter a valid mobile number, including country code.",
      fieldErrors: { phone: "Use a full mobile number, such as +14255551234." },
    };
  }

  const created = await createMfaChallenge({
    userId,
    purpose: "phone_enroll",
    channel: "sms",
    destination: phone,
  });

  let devCode: string | undefined;
  if (!created.reused) {
    const sent = await sendMfaSmsCode({ toE164: phone, code: created.code });
    if (!sent.ok) {
      return { error: sent.error ?? "Unable to send the verification Text/SMS." };
    }
    if (shouldExposeDevMfaCode(sent.provider)) {
      devCode = created.code;
    }
  }

  return {
    success: true,
    view: {
      channel: "sms",
      maskedDestination: maskPhoneForMfa(phone),
      smsBackupAvailable: true,
      smsBackupMaskedPhone: maskPhoneForMfa(phone),
      retryAfterSeconds: retryAfterSeconds(created.challenge.createdAt),
      devCode,
    },
  };
}

export async function verifyPhoneEnrollment(code: string): Promise<MfaActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "You must be signed in." };

  const result = await verifyMfaCode({
    userId,
    purpose: "phone_enroll",
    channel: "sms",
    code,
  });
  if (!result.ok) {
    return {
      error: result.error,
      fieldErrors: { code: result.error },
    };
  }

  const previous = await getOrCreateUserSecuritySettings(userId);
  const replacing = Boolean(
    previous.verifiedPhone &&
      previous.verifiedPhone !== result.challenge.destination,
  );

  await setVerifiedPhone({
    userId,
    phoneE164: result.challenge.destination,
  });

  if (replacing) {
    const { revokeAllTrustedDevices } = await import("@/lib/mfa/trusted-devices");
    await revokeAllTrustedDevices(userId, "mfa_phone_replaced");
  }

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    userId,
    action: AuditAction.AUTH_MFA_PHONE_VERIFIED,
    entityType: AuditEntityType.USER,
    entityId: userId,
    metadata: { channel: "sms" },
  });

  return { success: true, verified: true };
}

export async function removeVerifiedPhone(
  currentPassword: string,
): Promise<MfaActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "You must be signed in." };

  const stepUp = await requirePasswordStepUp(currentPassword);
  if (!stepUp.ok) {
    return {
      error: stepUp.error,
      fieldErrors: stepUp.fieldErrors,
    };
  }

  await getOrCreateUserSecuritySettings(userId);
  await clearVerifiedPhone(userId);

  const { revokeAllTrustedDevices } = await import("@/lib/mfa/trusted-devices");
  await revokeAllTrustedDevices(userId, "mfa_method_removed");

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    userId,
    action: AuditAction.AUTH_MFA_PHONE_REMOVED,
    entityType: AuditEntityType.USER,
    entityId: userId,
  });

  return { success: true };
}
