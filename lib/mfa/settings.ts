import { createAdminClient } from "@/lib/supabase/admin";
import type { UserSecuritySettings } from "@/lib/mfa/types";

type SettingsRow = {
  user_id: string;
  email_mfa_enabled: boolean;
  sms_backup_enabled: boolean;
  verified_phone: string | null;
  phone_verified_at: string | null;
  trusted_device_enabled: boolean;
  mfa_required: boolean;
  last_login_mfa_at?: string | null;
  created_at: string;
  updated_at: string;
};

const SETTINGS_SELECT =
  "user_id, email_mfa_enabled, sms_backup_enabled, verified_phone, phone_verified_at, trusted_device_enabled, mfa_required, last_login_mfa_at, created_at, updated_at";
const SETTINGS_SELECT_LEGACY =
  "user_id, email_mfa_enabled, sms_backup_enabled, verified_phone, phone_verified_at, trusted_device_enabled, mfa_required, created_at, updated_at";

function isMissingLastLoginMfaColumn(message: string): boolean {
  return /last_login_mfa_at/i.test(message);
}

function mapSettings(row: SettingsRow): UserSecuritySettings {
  return {
    userId: row.user_id,
    emailMfaEnabled: row.email_mfa_enabled,
    smsBackupEnabled: row.sms_backup_enabled,
    verifiedPhone: row.verified_phone,
    phoneVerifiedAt: row.phone_verified_at,
    trustedDeviceEnabled: row.trusted_device_enabled,
    mfaRequired: row.mfa_required,
    lastLoginMfaAt: row.last_login_mfa_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateUserSecuritySettings(
  userId: string,
): Promise<UserSecuritySettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_security_settings")
    .select(SETTINGS_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (!isMissingLastLoginMfaColumn(error.message)) {
      throw new Error(error.message);
    }
    const fallback = await admin
      .from("user_security_settings")
      .select(SETTINGS_SELECT_LEGACY)
      .eq("user_id", userId)
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    if (fallback.data) return mapSettings(fallback.data as SettingsRow);
  } else if (data) {
    return mapSettings(data as SettingsRow);
  }

  const { data: created, error: insertError } = await admin
    .from("user_security_settings")
    .insert({ user_id: userId })
    .select(SETTINGS_SELECT_LEGACY)
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message ?? "Unable to create security settings.");
  }
  return mapSettings(created as SettingsRow);
}

export async function markLoginMfaCompleted(userId: string): Promise<string> {
  const at = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_security_settings")
    .update({ last_login_mfa_at: at })
    .eq("user_id", userId);

  if (error && !isMissingLastLoginMfaColumn(error.message)) {
    console.error("markLoginMfaCompleted failed:", error.message);
  }
  return at;
}

export async function setVerifiedPhone(input: {
  userId: string;
  phoneE164: string;
}): Promise<UserSecuritySettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_security_settings")
    .upsert(
      {
        user_id: input.userId,
        verified_phone: input.phoneE164,
        phone_verified_at: new Date().toISOString(),
        sms_backup_enabled: true,
        email_mfa_enabled: true,
        mfa_required: true,
      },
      { onConflict: "user_id" },
    )
    .select(SETTINGS_SELECT_LEGACY)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save verified phone.");
  }
  return mapSettings(data as SettingsRow);
}

export async function clearVerifiedPhone(
  userId: string,
): Promise<UserSecuritySettings> {
  await getOrCreateUserSecuritySettings(userId);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_security_settings")
    .update({
      verified_phone: null,
      phone_verified_at: null,
      sms_backup_enabled: false,
    })
    .eq("user_id", userId)
    .select(SETTINGS_SELECT_LEGACY)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to remove verified phone.");
  }
  return mapSettings(data as SettingsRow);
}

export function loginSmsBackupAvailable(settings: UserSecuritySettings): boolean {
  return Boolean(settings.smsBackupEnabled && settings.verifiedPhone);
}

