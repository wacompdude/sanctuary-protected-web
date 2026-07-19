import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/church/types";
import { normalizeMembershipRole } from "@/lib/church/types";
import { getChurchClockParts } from "@/lib/datetime/format";
import {
  CRITICAL_OVERRIDE_TYPES,
  severityAtLeast,
} from "@/lib/notifications/constants";
import type {
  ChurchNotificationSettings,
  NotificationSeverity,
  ResolvedRecipient,
} from "@/lib/notifications/types";

type MembershipRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
};

type PreferenceRow = {
  user_id: string;
  notification_type: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  minimum_severity: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  digest_frequency: string;
};

function displayNameFromProfile(profile: ProfileRow | undefined, fallback: string) {
  if (!profile) return fallback;
  if (profile.full_name?.trim()) return profile.full_name.trim();
  const parts = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || fallback;
}

function inQuietHours(
  now: Date,
  start: string | null,
  end: string | null,
  timeZone?: string | null,
): boolean {
  if (!start || !end) return false;
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  if (
    [startH, startM, endH, endM].some((value) => Number.isNaN(value))
  ) {
    return false;
  }
  const clock = getChurchClockParts(now, timeZone);
  const minutes = clock.hour * 60 + clock.minute;
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  return minutes >= startMinutes || minutes < endMinutes;
}

export async function resolveUsersByChurchRole(
  supabase: SupabaseClient,
  churchId: string,
  roles: MembershipRole[],
): Promise<ResolvedRecipient[]> {
  if (roles.length === 0) return [];

  const { data: memberships, error } = await supabase
    .from("church_memberships")
    .select("id, user_id, role, status")
    .eq("church_id", churchId)
    .eq("status", "active")
    .in("role", roles);

  if (error) {
    throw new Error(error.message);
  }

  return hydrateRecipients(supabase, (memberships ?? []) as MembershipRow[]);
}

export async function resolveUsersByIds(
  supabase: SupabaseClient,
  churchId: string,
  userIds: string[],
): Promise<ResolvedRecipient[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const { data: memberships, error } = await supabase
    .from("church_memberships")
    .select("id, user_id, role, status")
    .eq("church_id", churchId)
    .eq("status", "active")
    .in("user_id", unique);

  if (error) {
    throw new Error(error.message);
  }

  return hydrateRecipients(supabase, (memberships ?? []) as MembershipRow[]);
}

async function hydrateRecipients(
  supabase: SupabaseClient,
  memberships: MembershipRow[],
): Promise<ResolvedRecipient[]> {
  if (memberships.length === 0) return [];

  const userIds = memberships.map((row) => row.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, full_name")
    .in("id", userIds);

  const profileById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );

  // Prefer admin Auth lookup when available; otherwise leave email null.
  const emailByUserId = await lookupEmails(userIds);

  const recipients: ResolvedRecipient[] = [];
  for (const membership of memberships) {
    const emailInfo = emailByUserId.get(membership.user_id);
    recipients.push({
      userId: membership.user_id,
      membershipId: membership.id,
      email: emailInfo?.email ?? null,
      emailVerified: emailInfo?.verified ?? false,
      displayName: displayNameFromProfile(
        profileById.get(membership.user_id),
        emailInfo?.email ?? "Team member",
      ),
      role: normalizeMembershipRole(membership.role),
    });
  }
  return recipients;
}

async function lookupEmails(
  userIds: string[],
): Promise<Map<string, { email: string | null; verified: boolean }>> {
  const map = new Map<string, { email: string | null; verified: boolean }>();
  try {
    const { createAdminClient, isServiceRoleConfigured } = await import(
      "@/lib/supabase/admin"
    );
    if (!isServiceRoleConfigured()) {
      return map;
    }
    const admin = createAdminClient();
    // Batch via listUsers is expensive; fetch individually with a small cap.
    for (const userId of userIds.slice(0, 100)) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) continue;
      map.set(userId, {
        email: data.user.email ?? null,
        verified: Boolean(data.user.email_confirmed_at),
      });
    }
  } catch {
    // Caller may still create in-app notifications without email.
  }
  return map;
}

export async function applyRecipientPreferences(params: {
  supabase: SupabaseClient;
  churchId: string;
  notificationType: string;
  severity: NotificationSeverity;
  settings: ChurchNotificationSettings;
  recipients: ResolvedRecipient[];
  now?: Date;
}): Promise<{
  inApp: ResolvedRecipient[];
  email: ResolvedRecipient[];
}> {
  const {
    supabase,
    churchId,
    notificationType,
    severity,
    settings,
    recipients,
    now = new Date(),
  } = params;

  if (recipients.length === 0) {
    return { inApp: [], email: [] };
  }

  const userIds = recipients.map((recipient) => recipient.userId);
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select(
      "user_id, notification_type, email_enabled, in_app_enabled, minimum_severity, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, digest_frequency",
    )
    .eq("church_id", churchId)
    .in("user_id", userIds)
    .in("notification_type", [notificationType, "*"]);

  const prefByUser = new Map<string, PreferenceRow>();
  for (const row of (prefs ?? []) as PreferenceRow[]) {
    if (row.notification_type === notificationType || !prefByUser.has(row.user_id)) {
      prefByUser.set(row.user_id, row);
    }
  }

  const isCriticalOverride =
    settings.critical_alert_override_enabled &&
    (severity === "critical" || CRITICAL_OVERRIDE_TYPES.has(notificationType));

  const inApp: ResolvedRecipient[] = [];
  const email: ResolvedRecipient[] = [];

  for (const recipient of recipients) {
    const pref = prefByUser.get(recipient.userId);
    const minSeverity = (pref?.minimum_severity ??
      "informational") as NotificationSeverity;
    const severityOk =
      isCriticalOverride || severityAtLeast(severity, minSeverity);
    if (!severityOk) continue;

    const quiet =
      !isCriticalOverride &&
      Boolean(pref?.quiet_hours_enabled) &&
      inQuietHours(
        now,
        pref?.quiet_hours_start ?? null,
        pref?.quiet_hours_end ?? null,
        settings.timezone,
      );

    const inAppEnabled = pref?.in_app_enabled !== false;
    if (inAppEnabled) {
      inApp.push(recipient);
    }

    const digestNever = pref?.digest_frequency === "never";
    const emailEnabled =
      settings.email_notifications_enabled &&
      (isCriticalOverride || pref?.email_enabled !== false) &&
      !digestNever &&
      !quiet;

    if (
      emailEnabled &&
      recipient.email &&
      recipient.emailVerified &&
      isValidEmailLocal(recipient.email)
    ) {
      email.push(recipient);
    }
  }

  return { inApp, email };
}

function isValidEmailLocal(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function resolveIncidentNotificationRecipients(
  supabase: SupabaseClient,
  churchId: string,
  settings: ChurchNotificationSettings,
  severity: NotificationSeverity,
): Promise<ResolvedRecipient[]> {
  const roles = (
    severity === "critical"
      ? settings.default_critical_notification_roles
      : settings.default_incident_notification_roles
  ) as MembershipRole[];

  return resolveUsersByChurchRole(supabase, churchId, roles);
}

export async function dedupeRecipients(
  recipients: ResolvedRecipient[],
): Promise<ResolvedRecipient[]> {
  const seen = new Set<string>();
  const result: ResolvedRecipient[] = [];
  for (const recipient of recipients) {
    if (seen.has(recipient.userId)) continue;
    seen.add(recipient.userId);
    result.push(recipient);
  }
  return result;
}
