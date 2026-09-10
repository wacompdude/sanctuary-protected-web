import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  generateMfaCode,
  hashMfaCode,
  mfaCodeHashesMatch,
  normalizeMfaCodeInput,
} from "@/lib/mfa/codes";
import { sendMfaSmsCode, shouldExposeDevMfaCode } from "@/lib/mfa/send-sms";
import { birdCategoryForAppMessage, sendBirdSms } from "@/lib/sms/bird-send";
import { smsHelpReply, smsOptInConfirmation } from "@/lib/sms/consent-copy";

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function sendSmsEnrollmentCode(params: {
  organizationId: string;
  userId: string;
  phoneE164: string;
}): Promise<{ ok: boolean; error?: string; devCode?: string; challengeId?: string }> {
  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "SMS verification is not configured." };
  }
  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const code = generateMfaCode();
  const codeHash = hashMfaCode(code, id);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { error } = await admin.from("sms_phone_verifications").insert({
    id,
    organization_id: params.organizationId,
    user_id: params.userId,
    phone_e164: params.phoneE164,
    code_hash: codeHash,
    expires_at: expiresAt,
    max_attempts: MAX_ATTEMPTS,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  const text = `Your Sanctuary Protected verification code is ${code}. This code expires in 10 minutes.`;
  const bird = await sendBirdSms({
    toE164: params.phoneE164,
    text,
    category: birdCategoryForAppMessage("enrollment_otp"),
  });
  if (bird.ok) {
    return { ok: true, challengeId: id };
  }

  const fallback = await sendMfaSmsCode({ toE164: params.phoneE164, code });
  if (!fallback.ok) {
    return {
      ok: false,
      error: fallback.error ?? bird.error ?? "Unable to send the verification text.",
    };
  }
  return {
    ok: true,
    challengeId: id,
    devCode: shouldExposeDevMfaCode(fallback.provider) ? code : undefined,
  };
}

export async function verifySmsEnrollmentCode(params: {
  organizationId: string;
  userId: string;
  phoneE164: string;
  code: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isServiceRoleConfigured()) {
    return { ok: false, error: "SMS verification is not configured." };
  }
  const normalized = normalizeMfaCodeInput(params.code);
  if (!normalized) {
    return { ok: false, error: "Enter the 6-digit code." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sms_phone_verifications")
    .select("id, code_hash, attempts, max_attempts, expires_at, consumed_at, phone_e164")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("phone_e164", params.phoneE164)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "That code is invalid or has expired." };
  }

  const attempts = Number(data.attempts ?? 0);
  const maxAttempts = Number(data.max_attempts ?? MAX_ATTEMPTS);
  if (attempts >= maxAttempts) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }

  const expected = hashMfaCode(normalized, String(data.id));
  if (!mfaCodeHashesMatch(expected, String(data.code_hash))) {
    await admin
      .from("sms_phone_verifications")
      .update({ attempts: attempts + 1 })
      .eq("id", data.id);
    return { ok: false, error: "That code is incorrect." };
  }

  await admin
    .from("sms_phone_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id);

  return { ok: true };
}

export async function sendSmsEnrollmentConfirmation(toE164: string): Promise<void> {
  await sendBirdSms({
    toE164,
    text: smsOptInConfirmation(),
    category: birdCategoryForAppMessage("enrollment_confirm"),
  });
}

export async function sendSmsHelpReply(toE164: string): Promise<void> {
  await sendBirdSms({
    toE164,
    text: smsHelpReply(),
    category: birdCategoryForAppMessage("help"),
  });
}
