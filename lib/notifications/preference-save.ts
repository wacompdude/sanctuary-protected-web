export const CHURCH_WIDE_PREFERENCE_CONFLICT =
  "organization_id,user_id,notification_type" as const;

export type ChurchWidePreferenceWrite = {
  mode: "upsert";
  onConflict: typeof CHURCH_WIDE_PREFERENCE_CONFLICT;
  row: {
    organization_id: string;
    user_id: string;
    notification_type: string;
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
    in_app_enabled: boolean;
    minimum_severity: string;
    quiet_hours_enabled: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    timezone: string;
    digest_frequency: string;
  };
};

/**
 * Church-wide Notification Preferences save.
 * A missing row is inserted by the upsert. An existing row is updated in
 * place. SMS is whatever the submitted checkbox says; other submitted fields
 * are kept as submitted.
 */
export function churchWidePreferenceWrite(input: {
  organizationId: string;
  userId: string;
  notificationType: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  minimumSeverity: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  digestFrequency: string;
}): ChurchWidePreferenceWrite {
  const notificationType = input.notificationType.trim() || "*";
  return {
    mode: "upsert",
    onConflict: CHURCH_WIDE_PREFERENCE_CONFLICT,
    row: {
      organization_id: input.organizationId,
      user_id: input.userId,
      notification_type: notificationType,
      email_enabled: input.emailEnabled,
      sms_enabled: input.smsEnabled,
      push_enabled: input.pushEnabled,
      in_app_enabled: input.inAppEnabled,
      minimum_severity: input.minimumSeverity,
      quiet_hours_enabled: input.quietHoursEnabled,
      quiet_hours_start: input.quietHoursStart,
      quiet_hours_end: input.quietHoursEnd,
      timezone: input.timezone,
      digest_frequency: input.digestFrequency,
    },
  };
}

export function preferenceSaveOutcome(
  writeError: string | null,
): { success: true } | { error: string } {
  if (writeError) return { error: writeError };
  return { success: true };
}
