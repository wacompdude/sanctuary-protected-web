import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChurchNotificationSettings,
  NotificationTemplate,
} from "@/lib/notifications/types";

const DEFAULT_ROLES = ["owner", "administrator", "security_leader"];

function normalizeRoleArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_ROLES];
  return value
    .map((item) => String(item))
    .filter((item) =>
      [
        "owner",
        "administrator",
        "security_leader",
        "security_member",
        "viewer",
      ].includes(item),
    );
}

function mapSettingsRow(row: Record<string, unknown>): ChurchNotificationSettings {
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    default_sender_name:
      typeof row.default_sender_name === "string"
        ? row.default_sender_name
        : null,
    reply_to_email:
      typeof row.reply_to_email === "string" ? row.reply_to_email : null,
    email_notifications_enabled: row.email_notifications_enabled !== false,
    sms_notifications_enabled: Boolean(row.sms_notifications_enabled),
    push_notifications_enabled: Boolean(row.push_notifications_enabled),
    critical_alert_override_enabled:
      row.critical_alert_override_enabled !== false,
    default_incident_notification_roles: normalizeRoleArray(
      row.default_incident_notification_roles,
    ),
    default_critical_notification_roles: normalizeRoleArray(
      row.default_critical_notification_roles,
    ),
    certification_warning_days: Number(row.certification_warning_days ?? 60),
    maintenance_warning_days: Number(row.maintenance_warning_days ?? 30),
    daily_digest_enabled: Boolean(row.daily_digest_enabled),
    daily_digest_time: String(row.daily_digest_time ?? "08:00:00"),
    weekly_digest_enabled: Boolean(row.weekly_digest_enabled),
    weekly_digest_day: Number(row.weekly_digest_day ?? 1),
    weekly_digest_time: String(row.weekly_digest_time ?? "08:00:00"),
    timezone: String(row.timezone ?? "America/Los_Angeles"),
    max_email_attempts: Number(row.max_email_attempts ?? 3),
  };
}

export async function getChurchNotificationSettings(
  supabase: SupabaseClient,
  churchId: string,
): Promise<ChurchNotificationSettings> {
  const { data, error } = await supabase
    .from("church_notification_settings")
    .select("*")
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message.includes("does not exist")
        ? "Notification settings are not configured yet. Run supabase/migrations/027_notifications.sql."
        : error.message,
    );
  }

  if (data) {
    return mapSettingsRow(data as Record<string, unknown>);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("church_notification_settings")
    .insert({ church_id: churchId })
    .select("*")
    .single();

  if (insertError || !inserted) {
    // Fall back to in-memory defaults if insert is blocked by RLS for the caller.
    return {
      id: "default",
      church_id: churchId,
      default_sender_name: null,
      reply_to_email: null,
      email_notifications_enabled: true,
      sms_notifications_enabled: false,
      push_notifications_enabled: false,
      critical_alert_override_enabled: true,
      default_incident_notification_roles: [...DEFAULT_ROLES],
      default_critical_notification_roles: [...DEFAULT_ROLES],
      certification_warning_days: 60,
      maintenance_warning_days: 30,
      daily_digest_enabled: false,
      daily_digest_time: "08:00:00",
      weekly_digest_enabled: false,
      weekly_digest_day: 1,
      weekly_digest_time: "08:00:00",
      timezone: "America/Los_Angeles",
      max_email_attempts: 3,
    };
  }

  return mapSettingsRow(inserted as Record<string, unknown>);
}

export async function getNotificationTemplate(
  supabase: SupabaseClient,
  churchId: string,
  templateKey: string,
  channel: "email" | "sms" | "push" | "in_app" = "email",
): Promise<NotificationTemplate | null> {
  const { data: churchTemplate } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("church_id", churchId)
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .eq("is_active", true)
    .maybeSingle();

  if (churchTemplate) {
    return mapTemplate(churchTemplate as Record<string, unknown>);
  }

  const { data: systemTemplate } = await supabase
    .from("notification_templates")
    .select("*")
    .is("church_id", null)
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .eq("is_system_template", true)
    .eq("is_active", true)
    .maybeSingle();

  return systemTemplate
    ? mapTemplate(systemTemplate as Record<string, unknown>)
    : null;
}

function mapTemplate(row: Record<string, unknown>): NotificationTemplate {
  return {
    id: String(row.id),
    church_id: (row.church_id as string | null) ?? null,
    template_key: String(row.template_key),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    channel: row.channel as NotificationTemplate["channel"],
    subject_template: String(row.subject_template),
    body_text_template: String(row.body_text_template),
    body_html_template: (row.body_html_template as string | null) ?? null,
    severity: row.severity as NotificationTemplate["severity"],
    is_system_template: Boolean(row.is_system_template),
    is_active: Boolean(row.is_active),
    version: Number(row.version ?? 1),
    allowed_variables: Array.isArray(row.allowed_variables)
      ? row.allowed_variables.map(String)
      : [],
  };
}
