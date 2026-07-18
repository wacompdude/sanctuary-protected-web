"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  canCreateNotificationGroup,
  canManageNotificationGroup,
} from "@/lib/notifications/groups/permissions";
import {
  parseGroupName,
  parseGroupSeverity,
  parseGroupStatus,
  parseGroupType,
} from "@/lib/notifications/groups/validation";
import { getNotificationGroup } from "@/lib/notifications/groups/queries";
function readCheckbox(formData: FormData, name: string): boolean {
  return (
    formData.get(name) === "on" ||
    formData.get(name) === "true" ||
    formData.get(name) === "1"
  );
}

function revalidateGroups(groupId?: string) {
  revalidatePath("/notification-groups");
  if (groupId) {
    revalidatePath(`/notification-groups/${groupId}`);
    revalidatePath(`/notification-groups/${groupId}/edit`);
  }
}

export async function createNotificationGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let createdId: string | null = null;
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const nameResult = parseGroupName(formData.get("name"));
    if (nameResult.error || !nameResult.name) {
      return { error: nameResult.error ?? "Group name is required." };
    }
    const groupType = parseGroupType(formData.get("group_type"));
    if (!groupType) return { error: "Select a valid group type." };
    if (!canCreateNotificationGroup(membership.role, groupType)) {
      return { error: "You do not have permission to create this group." };
    }

    const severity =
      parseGroupSeverity(formData.get("default_notification_severity")) ??
      "informational";
    const campusId = String(formData.get("campus_id") ?? "").trim() || null;
    const description =
      String(formData.get("description") ?? "").trim() || null;

    const { data, error } = await supabase
      .from("notification_groups")
      .insert({
        church_id: church.id,
        campus_id: campusId,
        name: nameResult.name,
        description,
        group_type: groupType,
        status: "active",
        is_system_group: false,
        allow_member_self_join: readCheckbox(formData, "allow_member_self_join"),
        allow_member_self_leave: readCheckbox(
          formData,
          "allow_member_self_leave",
        ),
        default_notification_severity: severity,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        error: error?.message.includes("notification_groups_church_name_unique")
          ? "A group with this name already exists."
          : (error?.message ?? "Unable to create group."),
      };
    }

    createdId = data.id as string;

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_GROUP_CREATED,
      entityType: AuditEntityType.NOTIFICATION_GROUP,
      entityId: createdId,
      metadata: { name: nameResult.name, group_type: groupType },
    });

    revalidateGroups(createdId);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to create group.",
    };
  }

  redirect(
    createdId
      ? `/notification-groups/${createdId}`
      : "/notification-groups",
  );
}

export async function updateNotificationGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const groupId = String(formData.get("group_id") ?? "").trim();
    if (!groupId) return { error: "Group is required." };

    const existing = await getNotificationGroup(church.id, groupId);
    if (!existing) return { error: "Group not found." };
    if (
      !canManageNotificationGroup(
        membership.role,
        existing.group_type,
        existing.is_system_group,
      )
    ) {
      return { error: "You do not have permission to update this group." };
    }

    const nameResult = parseGroupName(formData.get("name"));
    if (nameResult.error || !nameResult.name) {
      return { error: nameResult.error ?? "Group name is required." };
    }

    const groupType =
      parseGroupType(formData.get("group_type")) ?? existing.group_type;
    if (
      !existing.is_system_group &&
      !canManageNotificationGroup(membership.role, groupType, false)
    ) {
      return { error: "You do not have permission to use that group type." };
    }

    const status =
      parseGroupStatus(formData.get("status")) ?? existing.status;
    const severity =
      parseGroupSeverity(formData.get("default_notification_severity")) ??
      existing.default_notification_severity;
    const campusId = String(formData.get("campus_id") ?? "").trim() || null;
    const description =
      String(formData.get("description") ?? "").trim() || null;

    const patch: Record<string, unknown> = {
      name: existing.is_system_group ? existing.name : nameResult.name,
      description,
      status,
      campus_id: campusId,
      default_notification_severity: severity,
      allow_member_self_join: existing.is_system_group
        ? false
        : readCheckbox(formData, "allow_member_self_join"),
      allow_member_self_leave: existing.is_system_group
        ? false
        : readCheckbox(formData, "allow_member_self_leave"),
      updated_by: user.id,
      archived_at:
        status === "archived"
          ? (existing.archived_at ?? new Date().toISOString())
          : null,
    };

    if (!existing.is_system_group) {
      patch.group_type = groupType;
    }

    const { error } = await supabase
      .from("notification_groups")
      .update(patch)
      .eq("id", groupId)
      .eq("church_id", church.id);

    if (error) {
      return {
        error: error.message.includes("notification_groups_church_name_unique")
          ? "A group with this name already exists."
          : error.message,
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action:
        status === "archived"
          ? AuditAction.NOTIFICATION_GROUP_ARCHIVED
          : AuditAction.NOTIFICATION_GROUP_UPDATED,
      entityType: AuditEntityType.NOTIFICATION_GROUP,
      entityId: groupId,
      metadata: { name: nameResult.name, status },
    });

    revalidateGroups(groupId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update group.",
    };
  }
}

export async function archiveNotificationGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  formData.set("status", "archived");
  return updateNotificationGroupAction(_prev, formData);
}

export async function addNotificationGroupMembersAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const groupId = String(formData.get("group_id") ?? "").trim();
    if (!groupId) return { error: "Group is required." };

    const group = await getNotificationGroup(church.id, groupId);
    if (!group) return { error: "Group not found." };
    if (group.is_system_group) {
      return { error: "System groups are managed automatically." };
    }
    if (
      !canManageNotificationGroup(
        membership.role,
        group.group_type,
        group.is_system_group,
      )
    ) {
      return { error: "You do not have permission to manage this group." };
    }

    const membershipIds = formData
      .getAll("membership_ids")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (membershipIds.length === 0) {
      return { error: "Select at least one member." };
    }

    const { data: members, error: memberError } = await supabase
      .from("church_memberships")
      .select("id, user_id, status")
      .eq("church_id", church.id)
      .eq("status", "active")
      .in("id", membershipIds);

    if (memberError) return { error: memberError.message };
    const active = (members ?? []) as Array<{ id: string; user_id: string }>;
    if (active.length === 0) {
      return { error: "No active church members matched the selection." };
    }

    for (const row of active) {
      const { data: existing } = await supabase
        .from("notification_group_members")
        .select("id, status")
        .eq("group_id", groupId)
        .eq("membership_id", row.id)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from("notification_group_members")
          .update({
            status: "active",
            removed_at: null,
            added_by: user.id,
            added_at: new Date().toISOString(),
            user_id: row.user_id,
          })
          .eq("id", (existing as { id: string }).id);
        if (updateError) return { error: updateError.message };
      } else {
        const { error: insertError } = await supabase
          .from("notification_group_members")
          .insert({
            church_id: church.id,
            group_id: groupId,
            membership_id: row.id,
            user_id: row.user_id,
            status: "active",
            added_by: user.id,
            removed_at: null,
          });
        if (insertError && !/duplicate|unique/i.test(insertError.message)) {
          return { error: insertError.message };
        }
      }
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_GROUP_MEMBER_ADDED,
      entityType: AuditEntityType.NOTIFICATION_GROUP,
      entityId: groupId,
      metadata: { membership_count: active.length },
    });

    revalidateGroups(groupId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to add members.",
    };
  }
}

export async function addNotificationGroupMembersByRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church } = await getAuthenticatedUserWithChurch();
    const groupId = String(formData.get("group_id") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();
    if (!groupId || !role) {
      return { error: "Group and role are required." };
    }

    const { data: members, error } = await supabase
      .from("church_memberships")
      .select("id")
      .eq("church_id", church.id)
      .eq("status", "active")
      .eq("role", role);

    if (error) return { error: error.message };

    const next = new FormData();
    next.set("group_id", groupId);
    for (const row of members ?? []) {
      next.append("membership_ids", String((row as { id: string }).id));
    }
    return addNotificationGroupMembersAction(_prev, next);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to add members by role.",
    };
  }
}

export async function removeNotificationGroupMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const groupId = String(formData.get("group_id") ?? "").trim();
    const memberRowId = String(formData.get("member_id") ?? "").trim();
    if (!groupId || !memberRowId) {
      return { error: "Group member is required." };
    }

    const group = await getNotificationGroup(church.id, groupId);
    if (!group) return { error: "Group not found." };
    if (group.is_system_group) {
      return { error: "System groups are managed automatically." };
    }
    if (
      !canManageNotificationGroup(
        membership.role,
        group.group_type,
        group.is_system_group,
      )
    ) {
      return { error: "You do not have permission to manage this group." };
    }

    const { error } = await supabase
      .from("notification_group_members")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
      })
      .eq("id", memberRowId)
      .eq("group_id", groupId)
      .eq("church_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_GROUP_MEMBER_REMOVED,
      entityType: AuditEntityType.NOTIFICATION_GROUP,
      entityId: groupId,
      metadata: { member_row_id: memberRowId },
    });

    revalidateGroups(groupId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to remove member.",
    };
  }
}

export async function upsertNotificationGroupDefaultAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const groupId = String(formData.get("group_id") ?? "").trim();
    if (!groupId) return { error: "Group is required." };

    const group = await getNotificationGroup(church.id, groupId);
    if (!group) return { error: "Group not found." };
    if (
      !canManageNotificationGroup(
        membership.role,
        group.group_type,
        group.is_system_group,
      )
    ) {
      return { error: "You do not have permission to update defaults." };
    }

    const notificationType =
      String(formData.get("notification_type") ?? "*").trim() || "*";
    const severity =
      parseGroupSeverity(formData.get("minimum_severity")) ?? "informational";

    const payload = {
      church_id: church.id,
      group_id: groupId,
      notification_type: notificationType,
      email_enabled: readCheckbox(formData, "email_enabled"),
      sms_enabled: readCheckbox(formData, "sms_enabled"),
      push_enabled: readCheckbox(formData, "push_enabled"),
      in_app_enabled: readCheckbox(formData, "in_app_enabled"),
      minimum_severity: severity,
      require_acknowledgment: readCheckbox(formData, "require_acknowledgment"),
    };

    const { error } = await supabase
      .from("notification_group_defaults")
      .upsert(payload, { onConflict: "group_id,notification_type" });

    if (error) {
      // Fallback when unique index name differs from onConflict expectation
      const { data: existing } = await supabase
        .from("notification_group_defaults")
        .select("id")
        .eq("group_id", groupId)
        .eq("notification_type", notificationType)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from("notification_group_defaults")
          .update(payload)
          .eq("id", (existing as { id: string }).id);
        if (updateError) return { error: updateError.message };
      } else {
        const { error: insertError } = await supabase
          .from("notification_group_defaults")
          .insert(payload);
        if (insertError) return { error: insertError.message };
      }
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_GROUP_DEFAULTS_UPDATED,
      entityType: AuditEntityType.NOTIFICATION_GROUP,
      entityId: groupId,
      metadata: { notification_type: notificationType },
    });

    revalidateGroups(groupId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save group defaults.",
    };
  }
}
