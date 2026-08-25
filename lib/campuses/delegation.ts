import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAMPUS_DELEGATION_TEMPLATES,
  type CampusDelegationTemplateKey,
  type DelegatedCampusManagerRow,
  isDelegationActiveAt,
  isTopLevelCampusPermission,
} from "@/lib/campuses/campus-policy";
import { computeAssignmentStatus } from "@/lib/security/group-member-utils";
import {
  addPermissionToSecurityGroup,
  addUserToSecurityGroup,
  createSecurityGroup,
  getPermissionDefinitionByKey,
  getSecurityGroupPermissions,
  listSecurityGroups,
  removeUserFromSecurityGroup,
  updateSecurityGroupMember,
} from "@/lib/security/repository";
import type { PermissionScopeType } from "@/lib/security/types";
import { displayMemberName } from "@/lib/organization/team";

const TEMPLATE_NOTE_PREFIX = "campus-delegation-template:";

export type { DelegatedCampusManagerRow };

function templateKeyFromNotes(notes: string | null | undefined): CampusDelegationTemplateKey | null {
  if (!notes?.startsWith(TEMPLATE_NOTE_PREFIX)) return null;
  const key = notes.slice(TEMPLATE_NOTE_PREFIX.length).trim();
  return CAMPUS_DELEGATION_TEMPLATES.some((item) => item.key === key)
    ? (key as CampusDelegationTemplateKey)
    : null;
}

export async function ensureCampusDelegationTemplates(params: {
  admin: SupabaseClient;
  organizationId: string;
  createdBy: string;
}): Promise<void> {
  const groups = await listSecurityGroups(params.admin, params.organizationId, false);
  for (const template of CAMPUS_DELEGATION_TEMPLATES) {
    let group = groups.find(
      (item) =>
        item.name === template.name ||
        item.notes === `${TEMPLATE_NOTE_PREFIX}${template.key}`,
    );
    if (!group) {
      const created = await createSecurityGroup(
        params.admin,
        params.organizationId,
        template.name,
        template.description,
        params.createdBy,
      );
      if (created) {
        group = created;
        await params.admin
          .from("security_groups")
          .update({
            notes: `${TEMPLATE_NOTE_PREFIX}${template.key}`,
            system_template: true,
            high_risk: false,
          })
          .eq("id", group.id);
      }
    }
    if (!group) continue;

    const existing = await getSecurityGroupPermissions(params.admin, group.id);
    const existingDefIds = new Set(
      existing.map((row) => row.permission_definition_id),
    );
    for (const permissionKey of template.permissionKeys) {
      if (isTopLevelCampusPermission(permissionKey)) continue;
      const definition = await getPermissionDefinitionByKey(
        params.admin,
        permissionKey,
      );
      if (!definition || existingDefIds.has(definition.id)) continue;
      await addPermissionToSecurityGroup(
        params.admin,
        group.id,
        definition.id,
        params.createdBy,
        "all_current_future_campuses",
        null,
        null,
        null,
        `Delegated campus template ${template.key}`,
      );
    }
  }
}

export async function listDelegatedCampusManagers(params: {
  admin: SupabaseClient;
  organizationId: string;
  campusId: string;
  campusName: string;
}): Promise<DelegatedCampusManagerRow[]> {
  const groups = await listSecurityGroups(params.admin, params.organizationId, true);
  const templateGroups = groups.filter((group) => {
    const key = templateKeyFromNotes(group.notes);
    if (key) return true;
    return CAMPUS_DELEGATION_TEMPLATES.some((item) => item.name === group.name);
  });

  if (templateGroups.length === 0) return [];

  const groupIds = templateGroups.map((group) => group.id);
  const { data: members, error } = await params.admin
    .from("security_group_members")
    .select("*")
    .eq("organization_id", params.organizationId)
    .in("security_group_id", groupIds)
    .order("assigned_at", { ascending: false });

  if (error || !members?.length) return [];

  const relevant = members.filter((row) => {
    if (row.campus_id && row.campus_id !== params.campusId) return false;
    if (!row.campus_id && row.scope_type === "selected_campuses") return false;
    return true;
  });

  const userIds = [...new Set(relevant.map((row) => String(row.user_id)))];
  const assignedByIds = [
    ...new Set(relevant.map((row) => String(row.assigned_by)).filter(Boolean)),
  ];
  const profileIds = [...new Set([...userIds, ...assignedByIds])];

  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    params.admin
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", profileIds),
    params.admin
      .from("organization_memberships")
      .select("user_id, role, status")
      .eq("organization_id", params.organizationId)
      .in("user_id", userIds),
  ]);

  const profileById = new Map(
    (profiles ?? []).map((row) => [String(row.id), row]),
  );
  const roleByUserId = new Map(
    (memberships ?? []).map((row) => [String(row.user_id), String(row.role ?? "")]),
  );

  const permissionCache = new Map<string, string[]>();
  const rows: DelegatedCampusManagerRow[] = [];

  for (const member of relevant) {
    const group = templateGroups.find((item) => item.id === member.security_group_id);
    if (!group) continue;
    let permissions = permissionCache.get(group.id);
    if (!permissions) {
      const assigned = await getSecurityGroupPermissions(params.admin, group.id);
      const keys: string[] = [];
      for (const perm of assigned) {
        const def = await params.admin
          .from("permission_definitions")
          .select("permission_key")
          .eq("id", perm.permission_definition_id)
          .maybeSingle();
        if (def.data?.permission_key) keys.push(String(def.data.permission_key));
      }
      permissions = keys;
      permissionCache.set(group.id, keys);
    }

    const profile = profileById.get(String(member.user_id));
    const assignedBy = profileById.get(String(member.assigned_by));
    const computed = computeAssignmentStatus({
      status: member.status,
      effectiveAt: member.effective_at,
      expiresAt: member.expires_at,
    });

    rows.push({
      membershipId: String(member.id),
      groupId: group.id,
      groupName: group.name,
      templateKey: templateKeyFromNotes(group.notes),
      userId: String(member.user_id),
      name: profile
        ? displayMemberName({
            full_name: (profile.full_name as string | null) ?? null,
            first_name: (profile.first_name as string | null) ?? null,
            last_name: (profile.last_name as string | null) ?? null,
          })
        : "Member",
      email: null,
      churchRole: roleByUserId.get(String(member.user_id)) ?? null,
      campusId: member.campus_id ?? null,
      campusName: member.campus_id ? params.campusName : "All campuses",
      scopeType: (member.scope_type as PermissionScopeType) ?? "selected_campuses",
      permissions,
      effectiveAt: member.effective_at,
      expiresAt: member.expires_at,
      status: computed,
      assignedByUserId: String(member.assigned_by),
      assignedByName: assignedBy
        ? displayMemberName({
            full_name: (assignedBy.full_name as string | null) ?? null,
            first_name: (assignedBy.first_name as string | null) ?? null,
            last_name: (assignedBy.last_name as string | null) ?? null,
          })
        : "Unknown",
      assignmentReason: member.assignment_reason ?? null,
      administrativeNotes: member.administrative_notes ?? null,
    });
  }

  return rows;
}

export async function assignCampusDelegation(params: {
  admin: SupabaseClient;
  organizationId: string;
  campusId: string;
  actorUserId: string;
  targetUserId: string;
  templateKey: CampusDelegationTemplateKey;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  assignmentReason?: string | null;
  administrativeNotes?: string | null;
}) {
  await ensureCampusDelegationTemplates({
    admin: params.admin,
    organizationId: params.organizationId,
    createdBy: params.actorUserId,
  });
  const groups = await listSecurityGroups(params.admin, params.organizationId, true);
  const template = CAMPUS_DELEGATION_TEMPLATES.find(
    (item) => item.key === params.templateKey,
  );
  if (!template) throw new Error("Unknown campus delegation role.");
  const group = groups.find(
    (item) =>
      item.notes === `${TEMPLATE_NOTE_PREFIX}${template.key}` ||
      item.name === template.name,
  );
  if (!group) throw new Error("Campus delegation role is not configured.");

  const member = await addUserToSecurityGroup(
    params.admin,
    group.id,
    params.targetUserId,
    params.actorUserId,
    {
      organizationId: params.organizationId,
      campusId: params.campusId,
      scopeType: "selected_campuses",
      effectiveAt: params.effectiveAt ?? null,
      expiresAt: params.expiresAt ?? null,
      assignmentReason: params.assignmentReason ?? null,
      administrativeNotes: params.administrativeNotes ?? null,
    },
  );
  if (!member) {
    throw new Error("Unable to assign campus delegation. The member may already hold this role for this campus.");
  }
  return { member, group };
}

export async function revokeCampusDelegation(params: {
  admin: SupabaseClient;
  membershipId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  return removeUserFromSecurityGroup(
    params.admin,
    params.membershipId,
    params.actorUserId,
    params.reason ?? "Campus delegation revoked",
  );
}

export async function extendCampusDelegation(params: {
  admin: SupabaseClient;
  organizationId: string;
  membershipId: string;
  expiresAt: string | null;
  actorUserId: string;
}) {
  return updateSecurityGroupMember(
    params.admin,
    params.membershipId,
    params.organizationId,
    {
      expiresAt: params.expiresAt,
    },
    params.actorUserId,
  );
}

export function isCampusDelegationCurrentlyActive(row: {
  status: string;
  effectiveAt: string | null;
  expiresAt: string | null;
  now?: Date;
}): boolean {
  return isDelegationActiveAt({
    status: row.status === "active" ? "active" : "revoked",
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
    now: row.now,
  });
}
