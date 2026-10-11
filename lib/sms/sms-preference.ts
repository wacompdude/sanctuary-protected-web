import type { SupabaseClient } from "@supabase/supabase-js";

export const SMS_NOTIFICATION_PREFERENCE_TYPE = "*";

export type SmsPreferenceWrite =
  | "initialize"
  | "reenable"
  | "unchanged"
  | "blocked";

export type SmsPreferenceTrigger =
  | "no_phone"
  | "phone_unverified"
  | "consent_not_granted"
  | "explicit_enrollment_completed"
  | "explicit_reenable"
  | "profile_save"
  | "mfa_verification"
  | "backfill";

/**
 * Decides whether an SMS notification preference row should be created or
 * turned on. Only an explicit enrollment completion or an explicit re-enable
 * may write. A missing row is not consent, and a later disable is left alone
 * until the user explicitly enrolls or re-enables again.
 */
export function smsPreferenceWriteForTrigger(input: {
  trigger: SmsPreferenceTrigger;
  existingSmsEnabled: boolean | null;
  providerSuppressed?: boolean;
}): SmsPreferenceWrite {
  if (input.providerSuppressed) return "blocked";
  if (input.trigger === "explicit_enrollment_completed") {
    return input.existingSmsEnabled === null ? "initialize" : "unchanged";
  }
  if (input.trigger === "explicit_reenable") {
    return input.existingSmsEnabled === true ? "unchanged" : "reenable";
  }
  return "unchanged";
}

/**
 * Call only after the user has just finished explicit application SMS
 * enrollment: consent granted, endpoint verified and active, and no provider
 * suppression. A missing preference is initialized. An existing disable is
 * turned back on because this call itself is the explicit re-enable.
 * Repeated completion while already enabled does not write again.
 */
export function smsPreferenceActionForEnrollmentCompletion(input: {
  existingSmsEnabled: boolean | null;
  consentGranted: boolean;
  phoneVerified: boolean;
  endpointActive: boolean;
  providerSuppressed: boolean;
}): SmsPreferenceWrite {
  if (
    !input.consentGranted ||
    !input.phoneVerified ||
    !input.endpointActive ||
    input.providerSuppressed
  ) {
    return "blocked";
  }
  if (input.existingSmsEnabled === null) return "initialize";
  if (input.existingSmsEnabled === false) return "reenable";
  return "unchanged";
}

type PreferenceRow = { id: string; sms_enabled: boolean };

/**
 * Persists the enrollment decision. Does not clear STOP or other provider
 * suppression, and does not change email, push, quiet hours, or severity.
 */
export async function enableSmsPreferenceAfterExplicitEnrollment(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  consentGranted: boolean;
  phoneVerified: boolean;
  endpointActive: boolean;
  providerSuppressed: boolean;
}): Promise<{ status: SmsPreferenceWrite; error?: string }> {
  const { data, error } = await input.supabase
    .from("notification_preferences")
    .select("id, sms_enabled")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("notification_type", SMS_NOTIFICATION_PREFERENCE_TYPE)
    .maybeSingle();
  if (error) return { status: "blocked", error: error.message };

  const existing = data as PreferenceRow | null;
  const status = smsPreferenceActionForEnrollmentCompletion({
    existingSmsEnabled: existing ? existing.sms_enabled : null,
    consentGranted: input.consentGranted,
    phoneVerified: input.phoneVerified,
    endpointActive: input.endpointActive,
    providerSuppressed: input.providerSuppressed,
  });
  if (status === "unchanged" || status === "blocked") return { status };

  if (!existing) {
    const inserted = await input.supabase.from("notification_preferences").insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      notification_type: SMS_NOTIFICATION_PREFERENCE_TYPE,
      sms_enabled: true,
    });
    if (inserted.error) return { status: "blocked", error: inserted.error.message };
    return { status: "initialize" };
  }

  const updated = await input.supabase
    .from("notification_preferences")
    .update({ sms_enabled: true })
    .eq("id", existing.id)
    .eq("user_id", input.userId);
  if (updated.error) return { status: "blocked", error: updated.error.message };
  return { status: "reenable" };
}
