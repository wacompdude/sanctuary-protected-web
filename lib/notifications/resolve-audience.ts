import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/church/types";
import { normalizeMembershipRole } from "@/lib/church/types";
import { getChurchClockParts } from "@/lib/datetime/format";
import {
  CRITICAL_OVERRIDE_TYPES,
  severityAtLeast,
} from "@/lib/notifications/constants";
import { normalizeEmail } from "@/lib/notifications/endpoints/normalize";
import { resolveEffectiveMembersForGroups } from "@/lib/notifications/groups/membership-resolver";
import type {
  ChurchNotificationSettings,
  NotificationChannel,
  NotificationSeverity,
} from "@/lib/notifications/types";
import {
  resolveUsersByChurchRole,
  resolveUsersByIds,
} from "@/lib/notifications/resolve-recipients";

export type NotificationTargetInput = {
  groupIds?: string[];
  membershipIds?: string[];
  userIds?: string[];
  roles?: MembershipRole[];
};

export type SourceGroup = { id: string; name: string };

export type AudienceMember = {
  userId: string;
  membershipId: string;
  displayName: string;
  role: MembershipRole;
  sourceGroups: SourceGroup[];
};

export type PlannedDelivery = {
  userId: string;
  membershipId: string;
  displayName: string;
  role: MembershipRole | null;
  channel: NotificationChannel;
  destination: string | null;
  normalizedDestination: string | null;
  endpointId: string | null;
  sourceGroups: SourceGroup[];
  preferenceRuleApplied: string;
  overrideApplied: boolean;
  status: "pending" | "delivered" | "suppressed";
  suppressionReason?: string;
};

type PreferenceRuleRow = {
  user_id: string;
  group_id: string | null;
  notification_type: string;
  channel: string;
  enabled: boolean;
  minimum_severity: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  digest_frequency: string;
};

type LegacyPrefRow = {
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
  digest_frequency: string;
};

type EndpointRow = {
  id: string;
  user_id: string;
  channel: string;
  destination: string;
  normalized_destination: string;
  is_primary: boolean;
  is_verified: boolean;
  status: string;
  consent_status: string;
};

function inQuietHours(
  now: Date,
  start: string | null,
  end: string | null,
  timeZone?: string | null,
): boolean {
  if (!start || !end) return false;
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  if ([startH, startM, endH, endM].some((value) => Number.isNaN(value))) {
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

function displayName(
  profile:
    | {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined,
  fallback: string,
): string {
  if (!profile) return fallback;
  if (profile.full_name?.trim()) return profile.full_name.trim();
  const parts = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || fallback;
}

function pickRule(
  rules: PreferenceRuleRow[],
  userId: string,
  notificationType: string,
  channel: NotificationChannel,
  groupId: string | null,
): PreferenceRuleRow | null {
  const matches = rules.filter(
    (rule) =>
      rule.user_id === userId &&
      rule.channel === channel &&
      (rule.group_id ?? null) === groupId &&
      (rule.notification_type === notificationType ||
        rule.notification_type === "*"),
  );
  if (matches.length === 0) return null;
  return (
    matches.find((rule) => rule.notification_type === notificationType) ??
    matches[0] ??
    null
  );
}

function evaluateChannel(params: {
  userId: string;
  channel: NotificationChannel;
  sourceGroups: SourceGroup[];
  rules: PreferenceRuleRow[];
  legacy: LegacyPrefRow | null;
  settings: ChurchNotificationSettings;
  notificationType: string;
  severity: NotificationSeverity;
  now: Date;
}): {
  enabled: boolean;
  preferenceRuleApplied: string;
  overrideApplied: boolean;
  suppressionReason?: string;
} {
  const {
    userId,
    channel,
    sourceGroups,
    rules,
    legacy,
    settings,
    notificationType,
    severity,
    now,
  } = params;

  const isCritical =
    settings.critical_alert_override_enabled &&
    (severity === "critical" || CRITICAL_OVERRIDE_TYPES.has(notificationType));

  const allowEmailOverride =
    (settings as { allow_email_override?: boolean }).allow_email_override !==
    false;

  if (isCritical && channel === "email" && allowEmailOverride) {
    if (!settings.email_notifications_enabled) {
      return {
        enabled: false,
        preferenceRuleApplied: "church_channel_disabled",
        overrideApplied: false,
        suppressionReason: "channel_disabled",
      };
    }
    return {
      enabled: true,
      preferenceRuleApplied: "emergency_override",
      overrideApplied: true,
    };
  }

  // SMS/push never get silent emergency override without consent/config.
  if (channel === "sms" && !settings.sms_notifications_enabled) {
    return {
      enabled: false,
      preferenceRuleApplied: "church_sms_disabled",
      overrideApplied: false,
      suppressionReason: "provider_unavailable",
    };
  }
  if (channel === "push" && !settings.push_notifications_enabled) {
    return {
      enabled: false,
      preferenceRuleApplied: "church_push_disabled",
      overrideApplied: false,
      suppressionReason: "provider_unavailable",
    };
  }

  let sawGroupRule = false;
  let groupPathEnabled = false;
  for (const group of sourceGroups) {
    const rule = pickRule(rules, userId, notificationType, channel, group.id);
    if (!rule) continue;
    sawGroupRule = true;
    const severityOk = severityAtLeast(
      severity,
      rule.minimum_severity as NotificationSeverity,
    );
    const quiet =
      rule.quiet_hours_enabled &&
      inQuietHours(
        now,
        rule.quiet_hours_start,
        rule.quiet_hours_end,
        settings.timezone,
      );
    if (rule.enabled && severityOk && !quiet && rule.digest_frequency !== "never") {
      groupPathEnabled = true;
    }
  }
  if (sawGroupRule) {
    return groupPathEnabled
      ? {
          enabled: true,
          preferenceRuleApplied: "group_channel_preference",
          overrideApplied: false,
        }
      : {
          enabled: false,
          preferenceRuleApplied: "group_channel_preference",
          overrideApplied: false,
          suppressionReason: "user_opted_out",
        };
  }

  const typeRule = pickRule(rules, userId, notificationType, channel, null);
  if (typeRule) {
    const severityOk = severityAtLeast(
      severity,
      typeRule.minimum_severity as NotificationSeverity,
    );
    const quiet =
      typeRule.quiet_hours_enabled &&
      inQuietHours(
        now,
        typeRule.quiet_hours_start,
        typeRule.quiet_hours_end,
        settings.timezone,
      );
    const enabled =
      typeRule.enabled &&
      severityOk &&
      !quiet &&
      typeRule.digest_frequency !== "never";
    return {
      enabled,
      preferenceRuleApplied: "type_channel_preference",
      overrideApplied: false,
      suppressionReason: enabled ? undefined : "user_opted_out",
    };
  }

  const minSeverity = (legacy?.minimum_severity ??
    "informational") as NotificationSeverity;
  if (!severityAtLeast(severity, minSeverity)) {
    return {
      enabled: false,
      preferenceRuleApplied: "church_wide_member_preference",
      overrideApplied: false,
      suppressionReason: "below_minimum_severity",
    };
  }

  const quiet =
    Boolean(legacy?.quiet_hours_enabled) &&
    inQuietHours(
      now,
      legacy?.quiet_hours_start ?? null,
      legacy?.quiet_hours_end ?? null,
      settings.timezone,
    );
  if (quiet) {
    return {
      enabled: false,
      preferenceRuleApplied: "church_wide_member_preference",
      overrideApplied: false,
      suppressionReason: "quiet_hours",
    };
  }

  if (legacy?.digest_frequency === "never" && channel === "email") {
    return {
      enabled: false,
      preferenceRuleApplied: "church_wide_member_preference",
      overrideApplied: false,
      suppressionReason: "user_opted_out",
    };
  }

  let enabled = true;
  if (channel === "email") {
    enabled =
      settings.email_notifications_enabled && legacy?.email_enabled !== false;
  } else if (channel === "sms") {
    enabled = Boolean(legacy?.sms_enabled);
  } else if (channel === "push") {
    enabled = Boolean(legacy?.push_enabled);
  } else if (channel === "in_app") {
    enabled = legacy?.in_app_enabled !== false;
  }

  return {
    enabled,
    preferenceRuleApplied: "church_wide_member_preference",
    overrideApplied: false,
    suppressionReason: enabled ? undefined : "user_opted_out",
  };
}

function selectEndpoint(
  endpoints: EndpointRow[],
  userId: string,
  channel: NotificationChannel,
): EndpointRow | null {
  const rows = endpoints.filter(
    (row) => row.user_id === userId && row.channel === channel,
  );
  if (rows.length === 0) return null;
  return (
    rows.find((row) => row.is_primary && row.status === "active") ??
    rows.find((row) => row.status === "active") ??
    rows.find((row) => row.is_primary) ??
    rows[0] ??
    null
  );
}

/** Expand system + custom groups (including nested children) into active memberships. */
export async function resolveGroupMembers(
  supabase: SupabaseClient,
  churchId: string,
  groupIds: string[],
): Promise<Map<string, AudienceMember>> {
  const members = new Map<string, AudienceMember>();
  if (groupIds.length === 0) return members;

  const resolved = await resolveEffectiveMembersForGroups(
    supabase,
    churchId,
    groupIds,
  );

  for (const [userId, row] of resolved) {
    members.set(userId, {
      userId,
      membershipId: row.membershipId,
      displayName: "Member",
      role: normalizeMembershipRole(row.role),
      sourceGroups: row.sourceGroups,
    });
  }

  return members;
}

export async function resolveSystemGroupIdsForRoles(
  supabase: SupabaseClient,
  churchId: string,
  roles: MembershipRole[],
): Promise<string[]> {
  if (roles.length === 0) return [];
  const { data, error } = await supabase
    .from("notification_groups")
    .select("id, dynamic_rule_value")
    .eq("church_id", churchId)
    .eq("is_system_group", true)
    .eq("status", "active")
    .eq("dynamic_rule_type", "role")
    .in("dynamic_rule_value", roles);

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Central audience resolution: targets → members → prefs → endpoints → deliveries.
 */
export async function resolveNotificationAudience(params: {
  supabase: SupabaseClient;
  churchId: string;
  notificationType: string;
  severity: NotificationSeverity;
  settings: ChurchNotificationSettings;
  channels: NotificationChannel[];
  targets: NotificationTargetInput;
  now?: Date;
}): Promise<{
  members: AudienceMember[];
  deliveries: PlannedDelivery[];
  usedGroups: boolean;
}> {
  const {
    supabase,
    churchId,
    notificationType,
    severity,
    settings,
    channels,
    targets,
    now = new Date(),
  } = params;

  const memberMap = new Map<string, AudienceMember>();
  let usedGroups = false;

  if (targets.groupIds?.length) {
    usedGroups = true;
    const fromGroups = await resolveGroupMembers(
      supabase,
      churchId,
      targets.groupIds,
    );
    for (const [userId, member] of fromGroups) {
      memberMap.set(userId, member);
    }
  }

  if (targets.membershipIds?.length) {
    const { data: rows } = await supabase
      .from("church_memberships")
      .select("id, user_id, role, status")
      .eq("church_id", churchId)
      .eq("status", "active")
      .in("id", targets.membershipIds);
    for (const row of (rows ?? []) as Array<{
      id: string;
      user_id: string;
      role: string;
    }>) {
      if (!memberMap.has(row.user_id)) {
        memberMap.set(row.user_id, {
          userId: row.user_id,
          membershipId: row.id,
          displayName: "Member",
          role: normalizeMembershipRole(row.role),
          sourceGroups: [],
        });
      }
    }
  }

  if (targets.userIds?.length) {
    const resolved = await resolveUsersByIds(
      supabase,
      churchId,
      targets.userIds,
    );
    for (const row of resolved) {
      if (!row.membershipId) continue;
      if (!memberMap.has(row.userId)) {
        memberMap.set(row.userId, {
          userId: row.userId,
          membershipId: row.membershipId,
          displayName: row.displayName,
          role: row.role ?? "viewer",
          sourceGroups: [],
        });
      }
    }
  }

  // Role fallback when no members resolved yet (including empty/missing groups).
  if (targets.roles?.length && memberMap.size === 0) {
    const resolved = await resolveUsersByChurchRole(
      supabase,
      churchId,
      targets.roles,
    );
    for (const row of resolved) {
      if (!row.membershipId) continue;
      memberMap.set(row.userId, {
        userId: row.userId,
        membershipId: row.membershipId,
        displayName: row.displayName,
        role: row.role ?? "viewer",
        sourceGroups: [],
      });
    }
  }

  const members = [...memberMap.values()];
  if (members.length === 0) {
    return { members: [], deliveries: [], usedGroups };
  }

  const userIds = members.map((member) => member.userId);

  const [{ data: profiles }, { data: endpoints }, { data: rules }, { data: legacyPrefs }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name")
        .in("id", userIds),
      supabase
        .from("notification_endpoints")
        .select(
          "id, user_id, channel, destination, normalized_destination, is_primary, is_verified, status, consent_status",
        )
        .eq("church_id", churchId)
        .in("user_id", userIds)
        .neq("status", "revoked"),
      supabase
        .from("notification_preference_rules")
        .select(
          "user_id, group_id, notification_type, channel, enabled, minimum_severity, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, digest_frequency",
        )
        .eq("church_id", churchId)
        .in("user_id", userIds),
      supabase
        .from("notification_preferences")
        .select(
          "user_id, notification_type, email_enabled, sms_enabled, push_enabled, in_app_enabled, minimum_severity, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, digest_frequency",
        )
        .eq("church_id", churchId)
        .in("user_id", userIds)
        .in("notification_type", [notificationType, "*"]),
    ]);

  const profileById = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        full_name: string | null;
      }>
    ).map((row) => [row.id, row]),
  );

  for (const member of members) {
    member.displayName = displayName(
      profileById.get(member.userId),
      member.displayName,
    );
  }

  const endpointRows = (endpoints ?? []) as EndpointRow[];
  const ruleRows = (rules ?? []) as PreferenceRuleRow[];
  const legacyByUser = new Map<string, LegacyPrefRow>();
  for (const row of (legacyPrefs ?? []) as LegacyPrefRow[]) {
    if (
      row.notification_type === notificationType ||
      !legacyByUser.has(row.user_id)
    ) {
      legacyByUser.set(row.user_id, row);
    }
  }

  // Auth email fallback when endpoints missing (pre-Phase-4 data).
  const { createAdminClient, isServiceRoleConfigured } = await import(
    "@/lib/supabase/admin"
  );
  const authEmailByUser = new Map<
    string,
    { email: string; verified: boolean }
  >();
  if (isServiceRoleConfigured()) {
    const admin = createAdminClient();
    for (const userId of userIds.slice(0, 100)) {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data.user?.email) {
        authEmailByUser.set(userId, {
          email: data.user.email,
          verified: Boolean(data.user.email_confirmed_at),
        });
      }
    }
  }

  const deliveries: PlannedDelivery[] = [];
  const seenDelivery = new Set<string>();

  for (const member of members) {
    const legacy = legacyByUser.get(member.userId) ?? null;

    for (const channel of channels) {
      const decision = evaluateChannel({
        userId: member.userId,
        channel,
        sourceGroups: member.sourceGroups,
        rules: ruleRows,
        legacy,
        settings,
        notificationType,
        severity,
        now,
      });

      if (channel === "in_app") {
        if (!decision.enabled) {
          deliveries.push({
            userId: member.userId,
            membershipId: member.membershipId,
            displayName: member.displayName,
            role: member.role,
            channel,
            destination: null,
            normalizedDestination: null,
            endpointId: null,
            sourceGroups: member.sourceGroups,
            preferenceRuleApplied: decision.preferenceRuleApplied,
            overrideApplied: decision.overrideApplied,
            status: "suppressed",
            suppressionReason: decision.suppressionReason ?? "user_opted_out",
          });
          continue;
        }
        const key = `${member.userId}:in_app:in_app`;
        if (seenDelivery.has(key)) continue;
        seenDelivery.add(key);
        deliveries.push({
          userId: member.userId,
          membershipId: member.membershipId,
          displayName: member.displayName,
          role: member.role,
          channel: "in_app",
          destination: null,
          // Must be unique per recipient — DB unique index is
          // (notification_id, channel, lower(normalized_destination)).
          normalizedDestination: `in_app:${member.userId}`,
          endpointId: null,
          sourceGroups: member.sourceGroups,
          preferenceRuleApplied: decision.preferenceRuleApplied,
          overrideApplied: decision.overrideApplied,
          status: "delivered",
        });
        continue;
      }

      if (channel === "email") {
        const endpoint = selectEndpoint(endpointRows, member.userId, "email");
        const auth = authEmailByUser.get(member.userId);
        let destination: string | null = null;
        let normalized: string | null = null;
        let endpointId: string | null = null;
        let verified = false;

        if (
          endpoint &&
          endpoint.status === "active" &&
          endpoint.is_verified
        ) {
          destination = endpoint.destination;
          normalized = endpoint.normalized_destination;
          endpointId = endpoint.id;
          verified = true;
        } else if (auth?.verified) {
          destination = auth.email;
          normalized = normalizeEmail(auth.email);
          verified = true;
        } else if (endpoint && !endpoint.is_verified) {
          deliveries.push({
            userId: member.userId,
            membershipId: member.membershipId,
            displayName: member.displayName,
            role: member.role,
            channel,
            destination: endpoint.destination,
            normalizedDestination: endpoint.normalized_destination,
            endpointId: endpoint.id,
            sourceGroups: member.sourceGroups,
            preferenceRuleApplied: decision.preferenceRuleApplied,
            overrideApplied: decision.overrideApplied,
            status: "suppressed",
            suppressionReason: "endpoint_unverified",
          });
          continue;
        }

        if (!decision.enabled) {
          deliveries.push({
            userId: member.userId,
            membershipId: member.membershipId,
            displayName: member.displayName,
            role: member.role,
            channel,
            destination,
            normalizedDestination: normalized,
            endpointId,
            sourceGroups: member.sourceGroups,
            preferenceRuleApplied: decision.preferenceRuleApplied,
            overrideApplied: decision.overrideApplied,
            status: "suppressed",
            suppressionReason: decision.suppressionReason ?? "user_opted_out",
          });
          continue;
        }

        if (!destination || !normalized || !verified) {
          deliveries.push({
            userId: member.userId,
            membershipId: member.membershipId,
            displayName: member.displayName,
            role: member.role,
            channel,
            destination,
            normalizedDestination: normalized,
            endpointId,
            sourceGroups: member.sourceGroups,
            preferenceRuleApplied: decision.preferenceRuleApplied,
            overrideApplied: decision.overrideApplied,
            status: "suppressed",
            suppressionReason: "endpoint_unverified",
          });
          continue;
        }

        const key = `${member.userId}:email:${normalized.toLowerCase()}`;
        if (seenDelivery.has(key)) {
          deliveries.push({
            userId: member.userId,
            membershipId: member.membershipId,
            displayName: member.displayName,
            role: member.role,
            channel,
            destination,
            normalizedDestination: normalized,
            endpointId,
            sourceGroups: member.sourceGroups,
            preferenceRuleApplied: decision.preferenceRuleApplied,
            overrideApplied: decision.overrideApplied,
            status: "suppressed",
            suppressionReason: "duplicate_endpoint",
          });
          continue;
        }
        seenDelivery.add(key);
        deliveries.push({
          userId: member.userId,
          membershipId: member.membershipId,
          displayName: member.displayName,
          role: member.role,
          channel: "email",
          destination,
          normalizedDestination: normalized,
          endpointId,
          sourceGroups: member.sourceGroups,
          preferenceRuleApplied: decision.preferenceRuleApplied,
          overrideApplied: decision.overrideApplied,
          status: "pending",
        });
        continue;
      }

      if (channel === "sms" || channel === "push") {
        const endpoint = selectEndpoint(endpointRows, member.userId, channel);
        const reason =
          !decision.enabled
            ? (decision.suppressionReason ?? "user_opted_out")
            : !endpoint
              ? "endpoint_unverified"
              : endpoint.status !== "active" || !endpoint.is_verified
                ? "endpoint_unverified"
                : channel === "sms" && endpoint.consent_status !== "granted"
                  ? "consent_missing"
                  : "provider_unavailable";

        deliveries.push({
          userId: member.userId,
          membershipId: member.membershipId,
          displayName: member.displayName,
          role: member.role,
          channel,
          destination: endpoint?.destination ?? null,
          normalizedDestination: endpoint?.normalized_destination ?? null,
          endpointId: endpoint?.id ?? null,
          sourceGroups: member.sourceGroups,
          preferenceRuleApplied: decision.preferenceRuleApplied,
          overrideApplied: false,
          status: "suppressed",
          suppressionReason: reason,
        });
      }
    }
  }

  return { members, deliveries, usedGroups };
}
