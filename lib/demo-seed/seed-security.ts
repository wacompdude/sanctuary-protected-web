/**
 * lib/demo-seed/seed-security.ts
 * Demo security groups, memberships, and temporary direct permissions
 * for First Church of the First Church.
 */

import {
  getRegisteredId,
  registerSeedRecord,
  track,
} from "@/lib/demo-seed/registry";
import type { DemoSeedContext } from "@/lib/demo-seed/types";
import { log, warn } from "@/lib/demo-seed/types";

type PermissionDef = {
  id: string;
  permission_key: string;
  supports_campus_scope: boolean;
};

type GroupSpec = {
  seedKey: string;
  name: string;
  description: string;
  permissionKeys: string[];
  /** Deterministic "random" member count (2–5). */
  memberCount: number;
  memberSeedKeys: string[];
};

type TempGrantSpec = {
  seedKey: string;
  userSeedKey: string;
  permissionKey: string;
  /** Hours from now until effective (negative = already active). */
  effectiveInHours: number;
  /** Hours from now until expiration. */
  expiresInHours: number;
  campus: "primary" | "sunshine" | "none";
  reason: string;
};

const DEMO_SECURITY_GROUPS: GroupSpec[] = [
  {
    seedKey: "security_group.camera_operators",
    name: "Camera Feed Operators",
    description: "Monitor live camera feeds and review recordings during services.",
    permissionKeys: [
      "cameras.view_live",
      "cameras.view_recordings",
      "cameras.download_recordings",
      "campuses.view",
      "dashboard.view",
      "events.view",
    ],
    memberCount: 3,
    memberSeedKeys: [
      "user.security_member_hannibal",
      "user.security_member_angus",
      "user.extra.michael_carter",
      "user.viewer",
      "user.security_leader",
    ],
  },
  {
    seedKey: "security_group.incident_response",
    name: "Incident Response Team",
    description: "Create and manage incident reports across campuses.",
    permissionKeys: [
      "incidents.view",
      "incidents.create",
      "incidents.edit",
      "incidents.view_sensitive",
      "incidents.export",
      "notifications.send",
    ],
    memberCount: 5,
    memberSeedKeys: [
      "user.security_leader",
      "user.security_member_hannibal",
      "user.security_member_angus",
      "user.administrator",
      "user.extra.sarah_mitchell",
      "user.extra.david_thompson",
    ],
  },
  {
    seedKey: "security_group.report_analysts",
    name: "Report Analysts",
    description: "Run and export security and operations reports.",
    permissionKeys: [
      "reports.view",
      "reports.run",
      "reports.save",
      "reports.export",
      "reports.edit",
      "dashboard.view",
    ],
    memberCount: 2,
    memberSeedKeys: [
      "user.administrator",
      "user.co_owner",
      "user.extra.rebecca_lewis",
      "user.viewer",
    ],
  },
  {
    seedKey: "security_group.event_safety",
    name: "Event Safety Coordinators",
    description: "Coordinate team coverage and safety for church events.",
    permissionKeys: [
      "events.view",
      "events.create",
      "events.edit",
      "events.assign_team",
      "training.view",
      "certifications.view",
    ],
    memberCount: 4,
    memberSeedKeys: [
      "user.security_leader",
      "user.extra.thomas_walker",
      "user.extra.emily_parker",
      "user.security_member_angus",
      "user.extra.michael_carter",
    ],
  },
  {
    seedKey: "security_group.campus_security_leads",
    name: "Campus Security Leads",
    description: "Campus-level security administration and equipment oversight.",
    permissionKeys: [
      "security.view",
      "campuses.view",
      "equipment.view",
      "equipment.manage",
      "policies.view",
      "members.view",
    ],
    memberCount: 3,
    memberSeedKeys: [
      "user.co_owner",
      "user.administrator",
      "user.security_leader",
      "user.extra.david_thompson",
    ],
  },
];

/** 10 temporary grants across 7 team members and both campuses. */
const DEMO_TEMP_GRANTS: TempGrantSpec[] = [
  {
    seedKey: "user_permission.temp.cameras_live_hannibal",
    userSeedKey: "user.security_member_hannibal",
    permissionKey: "cameras.view_live",
    effectiveInHours: -2,
    expiresInHours: 24,
    campus: "primary",
    reason: "Weekend service camera coverage at Anytown",
  },
  {
    seedKey: "user_permission.temp.cameras_recordings_angus",
    userSeedKey: "user.security_member_angus",
    permissionKey: "cameras.view_recordings",
    effectiveInHours: 0,
    expiresInHours: 72,
    campus: "sunshine",
    reason: "Review Sunshine campus parking lot footage",
  },
  {
    seedKey: "user_permission.temp.incidents_create_john",
    userSeedKey: "user.security_leader",
    permissionKey: "incidents.create",
    effectiveInHours: -6,
    expiresInHours: 120,
    campus: "primary",
    reason: "Cover incident intake while campus lead is out",
  },
  {
    seedKey: "user_permission.temp.incidents_export_nora",
    userSeedKey: "user.administrator",
    permissionKey: "incidents.export",
    effectiveInHours: 0,
    expiresInHours: 168,
    campus: "none",
    reason: "Monthly board packet export window",
  },
  {
    seedKey: "user_permission.temp.reports_run_michael",
    userSeedKey: "user.extra.michael_carter",
    permissionKey: "reports.run",
    effectiveInHours: 0,
    expiresInHours: 240,
    campus: "sunshine",
    reason: "Sunshine campus weekly report trial",
  },
  {
    seedKey: "user_permission.temp.events_assign_bob",
    userSeedKey: "user.co_owner",
    permissionKey: "events.assign_team",
    effectiveInHours: -12,
    expiresInHours: 336,
    campus: "primary",
    reason: "Easter week scheduling support",
  },
  {
    seedKey: "user_permission.temp.cameras_download_hannibal",
    userSeedKey: "user.security_member_hannibal",
    permissionKey: "cameras.download_recordings",
    effectiveInHours: 24,
    expiresInHours: 504,
    campus: "sunshine",
    reason: "Scheduled evidence download window (starts tomorrow)",
  },
  {
    seedKey: "user_permission.temp.incidents_sensitive_john",
    userSeedKey: "user.security_leader",
    permissionKey: "incidents.view_sensitive",
    effectiveInHours: 0,
    expiresInHours: 720,
    campus: "primary",
    reason: "Sensitive case review for Anytown campus",
  },
  {
    seedKey: "user_permission.temp.notifications_ansel",
    userSeedKey: "user.viewer",
    permissionKey: "notifications.send",
    effectiveInHours: 12,
    expiresInHours: 96,
    campus: "none",
    reason: "Temporary announcement sender during outreach weekend",
  },
  {
    seedKey: "user_permission.temp.equipment_angus",
    userSeedKey: "user.security_member_angus",
    permissionKey: "equipment.manage",
    effectiveInHours: -1,
    expiresInHours: 48,
    campus: "none",
    reason: "Short-term radio and AED inventory update",
  },
];

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function userId(ctx: DemoSeedContext, key: string): string {
  const id = ctx.userIds.get(key);
  if (!id) throw new Error(`Missing seeded user ${key}`);
  return id;
}

async function loadPermissionCatalog(
  ctx: DemoSeedContext,
): Promise<Map<string, PermissionDef>> {
  const { data, error } = await ctx.admin
    .from("permission_definitions")
    .select("id, permission_key, supports_campus_scope")
    .eq("active", true);

  if (error) {
    throw new Error(`Failed to load permission_definitions: ${error.message}`);
  }

  const map = new Map<string, PermissionDef>();
  for (const row of data ?? []) {
    map.set(String(row.permission_key), {
      id: String(row.id),
      permission_key: String(row.permission_key),
      supports_campus_scope: Boolean(row.supports_campus_scope),
    });
  }
  return map;
}

async function upsertSecurityGroup(
  ctx: DemoSeedContext,
  spec: GroupSpec,
): Promise<string> {
  const existingId = await getRegisteredId(ctx.admin, ctx.seedSource, spec.seedKey);
  const payload = {
    organization_id: ctx.churchId,
    name: spec.name,
    description: spec.description,
    status: "active" as const,
    system_template: false,
    notes: "Demo seed security group",
    updated_by: ctx.ownerUserId,
  };

  if (existingId) {
    const { error } = await ctx.admin
      .from("security_groups")
      .update(payload)
      .eq("id", existingId);
    if (error) {
      throw new Error(`security_groups update (${spec.seedKey}): ${error.message}`);
    }
    await track(ctx.summary, "security_groups", "updated", `Updated group ${spec.name}`);
    return existingId;
  }

  const { data, error } = await ctx.admin
    .from("security_groups")
    .insert({
      ...payload,
      created_by: ctx.ownerUserId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`security_groups insert (${spec.seedKey}): ${error?.message ?? "unknown"}`);
  }

  const id = String(data.id);
  await registerSeedRecord({
    admin: ctx.admin,
    seedSource: ctx.seedSource,
    entityTable: "security_groups",
    entityId: id,
    seedKey: spec.seedKey,
  });
  await track(ctx.summary, "security_groups", "created", `Created group ${spec.name}`);
  return id;
}

async function upsertGroupPermission(
  ctx: DemoSeedContext,
  groupId: string,
  groupSeedKey: string,
  permission: PermissionDef,
): Promise<void> {
  const seedKey = `${groupSeedKey}.perm.${permission.permission_key}`;
  const existingId = await getRegisteredId(ctx.admin, ctx.seedSource, seedKey);

  if (existingId) {
    await track(
      ctx.summary,
      "security_group_permissions",
      "skipped",
      `Permission already on group: ${permission.permission_key}`,
    );
    return;
  }

  const { data, error } = await ctx.admin
    .from("security_group_permissions")
    .insert({
      security_group_id: groupId,
      permission_definition_id: permission.id,
      permission_effect: "grant",
      scope_type: permission.supports_campus_scope
        ? "all_current_future_campuses"
        : "no_restriction",
      campus_id: null,
      assigned_by: ctx.ownerUserId,
      reason: "Demo seed group permission",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    // Unique conflict — treat as already present
    if (error?.code === "23505") {
      await track(
        ctx.summary,
        "security_group_permissions",
        "skipped",
        `Permission already assigned: ${permission.permission_key}`,
      );
      return;
    }
    throw new Error(
      `security_group_permissions insert (${seedKey}): ${error?.message ?? "unknown"}`,
    );
  }

  await registerSeedRecord({
    admin: ctx.admin,
    seedSource: ctx.seedSource,
    entityTable: "security_group_permissions",
    entityId: String(data.id),
    seedKey,
  });
  await track(
    ctx.summary,
    "security_group_permissions",
    "created",
    `Assigned ${permission.permission_key}`,
  );
}

async function upsertGroupMember(
  ctx: DemoSeedContext,
  groupId: string,
  groupSeedKey: string,
  memberSeedKey: string,
): Promise<void> {
  const seedKey = `${groupSeedKey}.member.${memberSeedKey}`;
  const existingId = await getRegisteredId(ctx.admin, ctx.seedSource, seedKey);
  if (existingId) {
    await track(ctx.summary, "security_group_members", "skipped", `Member already in group`);
    return;
  }

  const memberUserId = userId(ctx, memberSeedKey);
  const { data, error } = await ctx.admin
    .from("security_group_members")
    .insert({
      security_group_id: groupId,
      user_id: memberUserId,
      status: "active",
      assigned_by: ctx.ownerUserId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    if (error?.code === "23505") {
      await track(ctx.summary, "security_group_members", "skipped", `Member already active`);
      return;
    }
    throw new Error(
      `security_group_members insert (${seedKey}): ${error?.message ?? "unknown"}`,
    );
  }

  await registerSeedRecord({
    admin: ctx.admin,
    seedSource: ctx.seedSource,
    entityTable: "security_group_members",
    entityId: String(data.id),
    seedKey,
  });
  await track(
    ctx.summary,
    "security_group_members",
    "created",
    `Added ${memberSeedKey} to group`,
  );
}

async function upsertTempPermission(
  ctx: DemoSeedContext,
  spec: TempGrantSpec,
  catalog: Map<string, PermissionDef>,
): Promise<void> {
  const permission = catalog.get(spec.permissionKey);
  if (!permission) {
    warn(ctx.summary, `Skipping temp grant; permission missing: ${spec.permissionKey}`);
    return;
  }

  const existingId = await getRegisteredId(ctx.admin, ctx.seedSource, spec.seedKey);
  const campusId =
    spec.campus === "primary"
      ? ctx.primaryCampusId
      : spec.campus === "sunshine"
        ? ctx.sunshineCampusId
        : null;

  const useSelectedCampus = Boolean(campusId) && permission.supports_campus_scope;
  const payload = {
    organization_id: ctx.churchId,
    user_id: userId(ctx, spec.userSeedKey),
    permission_definition_id: permission.id,
    permission_effect: "grant" as const,
    scope_type: useSelectedCampus
      ? ("selected_campuses" as const)
      : permission.supports_campus_scope
        ? ("all_current_future_campuses" as const)
        : ("no_restriction" as const),
    campus_id: useSelectedCampus ? campusId : null,
    effective_at: hoursFromNow(spec.effectiveInHours),
    expires_at: hoursFromNow(spec.expiresInHours),
    assigned_by: ctx.ownerUserId,
    reason: spec.reason,
    notes: "Demo seed temporary access",
  };

  if (existingId) {
    const { error } = await ctx.admin
      .from("user_permissions")
      .update({
        ...payload,
        status: "active",
        revoked_by: null,
        revoked_at: null,
      })
      .eq("id", existingId);
    if (error) {
      throw new Error(`user_permissions update (${spec.seedKey}): ${error.message}`);
    }
    await track(
      ctx.summary,
      "user_permissions",
      "updated",
      `Updated temp ${spec.permissionKey} for ${spec.userSeedKey}`,
    );
    return;
  }

  const { data, error } = await ctx.admin
    .from("user_permissions")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    if (error?.code === "23505") {
      warn(
        ctx.summary,
        `Temp permission conflict for ${spec.userSeedKey}/${spec.permissionKey}; skipped`,
      );
      return;
    }
    throw new Error(`user_permissions insert (${spec.seedKey}): ${error?.message ?? "unknown"}`);
  }

  await registerSeedRecord({
    admin: ctx.admin,
    seedSource: ctx.seedSource,
    entityTable: "user_permissions",
    entityId: String(data.id),
    seedKey: spec.seedKey,
  });
  await track(
    ctx.summary,
    "user_permissions",
    "created",
    `Granted temp ${spec.permissionKey} → ${spec.userSeedKey} (${spec.expiresInHours}h)`,
  );
}

export async function seedChurchSecurity(ctx: DemoSeedContext): Promise<void> {
  log(ctx.summary, "Seeding security groups, members, and temporary permissions");

  const catalog = await loadPermissionCatalog(ctx);
  if (catalog.size === 0) {
    warn(
      ctx.summary,
      "permission_definitions is empty — run migration 058_permission_definitions.sql",
    );
    return;
  }

  for (const groupSpec of DEMO_SECURITY_GROUPS) {
    const groupId = await upsertSecurityGroup(ctx, groupSpec);

    for (const key of groupSpec.permissionKeys) {
      const permission = catalog.get(key);
      if (!permission) {
        warn(ctx.summary, `Missing permission for group ${groupSpec.name}: ${key}`);
        continue;
      }
      await upsertGroupPermission(ctx, groupId, groupSpec.seedKey, permission);
    }

    const members = groupSpec.memberSeedKeys.slice(0, groupSpec.memberCount);
    for (const memberKey of members) {
      if (!ctx.userIds.has(memberKey)) {
        warn(ctx.summary, `Skipping missing member ${memberKey} for ${groupSpec.name}`);
        continue;
      }
      await upsertGroupMember(ctx, groupId, groupSpec.seedKey, memberKey);
    }
  }

  for (const grant of DEMO_TEMP_GRANTS) {
    if (!ctx.userIds.has(grant.userSeedKey)) {
      warn(ctx.summary, `Skipping temp grant; missing user ${grant.userSeedKey}`);
      continue;
    }
    await upsertTempPermission(ctx, grant, catalog);
  }

  log(ctx.summary, "Finished security demo seed");
}
