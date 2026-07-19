import { createClient } from "@/lib/supabase/server";
import { policyMigrationHintFromError } from "@/lib/policies/constants";
import type {
  PolicyAcknowledgment,
  PolicyAcknowledgmentReport,
  PolicyAcknowledgmentStatus,
  PolicyAssignment,
  PolicyAssignmentType,
} from "@/lib/policies/types";
import type { MembershipRole } from "@/lib/church/types";

function isMissing(message: string) {
  return Boolean(policyMigrationHintFromError(message));
}

function mapAck(row: Record<string, unknown>): PolicyAcknowledgment {
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    policy_document_id: String(row.policy_document_id),
    policy_version_id: String(row.policy_version_id),
    user_id: String(row.user_id),
    membership_id: row.membership_id ? String(row.membership_id) : null,
    acknowledgment_status: row.acknowledgment_status as PolicyAcknowledgmentStatus,
    assigned_at: String(row.assigned_at),
    due_at: row.due_at ? String(row.due_at) : null,
    viewed_at: row.viewed_at ? String(row.viewed_at) : null,
    acknowledged_at: row.acknowledged_at ? String(row.acknowledged_at) : null,
    acknowledgment_text: row.acknowledgment_text
      ? String(row.acknowledgment_text)
      : null,
    waived_by: row.waived_by ? String(row.waived_by) : null,
    waived_at: row.waived_at ? String(row.waived_at) : null,
    waiver_reason: row.waiver_reason ? String(row.waiver_reason) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    policy_title: row.policy_title ? String(row.policy_title) : null,
    policy_version_label: row.policy_version_label
      ? String(row.policy_version_label)
      : null,
    user_display_name: row.user_display_name
      ? String(row.user_display_name)
      : null,
  };
}

export async function listMyPendingPolicyAcknowledgments(
  churchId: string,
  userId: string,
): Promise<PolicyAcknowledgment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_acknowledgments")
    .select(
      `id, church_id, policy_document_id, policy_version_id, user_id, membership_id,
       acknowledgment_status, assigned_at, due_at, viewed_at, acknowledged_at,
       acknowledgment_text, waived_by, waived_at, waiver_reason, created_at, updated_at,
       policy_documents ( title ),
       policy_versions ( version_label )`,
    )
    .eq("church_id", churchId)
    .eq("user_id", userId)
    .in("acknowledgment_status", ["assigned", "viewed", "overdue"])
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissing(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const doc = row.policy_documents as { title?: string } | null;
    const version = row.policy_versions as { version_label?: string } | null;
    return mapAck({
      ...row,
      policy_title: doc?.title ?? null,
      policy_version_label: version?.version_label ?? null,
    });
  });
}

export async function getMyPolicyAcknowledgment(
  churchId: string,
  policyId: string,
  userId: string,
): Promise<PolicyAcknowledgment | null> {
  const supabase = await createClient();
  const { data: policy } = await supabase
    .from("policy_documents")
    .select("current_version_id")
    .eq("church_id", churchId)
    .eq("id", policyId)
    .maybeSingle();

  if (!policy?.current_version_id) return null;

  const { data, error } = await supabase
    .from("policy_acknowledgments")
    .select(
      `id, church_id, policy_document_id, policy_version_id, user_id, membership_id,
       acknowledgment_status, assigned_at, due_at, viewed_at, acknowledged_at,
       acknowledgment_text, waived_by, waived_at, waiver_reason, created_at, updated_at`,
    )
    .eq("church_id", churchId)
    .eq("policy_document_id", policyId)
    .eq("policy_version_id", policy.current_version_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissing(error.message)) return null;
    throw new Error(error.message);
  }
  return data ? mapAck(data as Record<string, unknown>) : null;
}

export async function getPolicyAcknowledgmentReport(
  churchId: string,
  policyId: string,
): Promise<PolicyAcknowledgmentReport> {
  const empty: PolicyAcknowledgmentReport = {
    total: 0,
    acknowledged: 0,
    pending: 0,
    overdue: 0,
    waived: 0,
    items: [],
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_acknowledgments")
    .select(
      `id, church_id, policy_document_id, policy_version_id, user_id, membership_id,
       acknowledgment_status, assigned_at, due_at, viewed_at, acknowledged_at,
       acknowledgment_text, waived_by, waived_at, waiver_reason, created_at, updated_at`,
    )
    .eq("church_id", churchId)
    .eq("policy_document_id", policyId)
    .order("acknowledgment_status", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissing(error.message)) return empty;
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((row) => String(row.user_id))));
  const nameByUser = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", userIds);
    for (const profile of profiles ?? []) {
      const name =
        profile.full_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        "Member";
      nameByUser.set(String(profile.id), name);
    }
  }

  const items = rows.map((row) =>
    mapAck({
      ...row,
      user_display_name: nameByUser.get(String(row.user_id)) ?? "Member",
    }),
  );

  const now = Date.now();
  let acknowledged = 0;
  let pending = 0;
  let overdue = 0;
  let waived = 0;

  for (const item of items) {
    if (item.acknowledgment_status === "acknowledged") {
      acknowledged += 1;
      continue;
    }
    if (item.acknowledgment_status === "waived") {
      waived += 1;
      continue;
    }
    if (
      item.acknowledgment_status === "overdue" ||
      (item.due_at && new Date(item.due_at).getTime() < now)
    ) {
      overdue += 1;
      continue;
    }
    pending += 1;
  }

  return {
    total: items.length,
    acknowledged,
    pending,
    overdue,
    waived,
    items,
  };
}

export async function assignPolicyAcknowledgments(
  policyId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_policy_acknowledgments", {
    p_document_id: policyId,
  });

  if (error) {
    if (
      /assign_policy_acknowledgments|034_policy|PGRST202|42883/i.test(
        error.message,
      )
    ) {
      throw new Error(
        "Run supabase/migrations/034_policy_acknowledgments_and_templates.sql to enable acknowledgment assignment.",
      );
    }
    throw new Error(error.message);
  }

  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((row) => {
        if (typeof row === "string") return row;
        if (row && typeof row === "object") {
          const value =
            (row as { assigned_user_id?: string }).assigned_user_id ??
            (row as { user_id?: string }).user_id;
          return value ? String(value) : null;
        }
        return null;
      })
      .filter((id): id is string => Boolean(id));
  }
  return [];
}

export async function ensureMyPolicyAcknowledgment(
  policyId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_my_policy_acknowledgment", {
    p_document_id: policyId,
  });
  if (error) {
    if (
      /ensure_my_policy_acknowledgment|034_policy|PGRST202|42883/i.test(
        error.message,
      )
    ) {
      return null;
    }
    throw new Error(error.message);
  }
  return data ? String(data) : null;
}

export async function listPolicyAssignments(
  churchId: string,
  policyId: string,
): Promise<PolicyAssignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("policy_assignments")
    .select(
      `id, church_id, policy_document_id, policy_version_id, assignment_type,
       role, campus_id, user_id, due_days, created_by, created_at, revoked_at`,
    )
    .eq("church_id", churchId)
    .eq("policy_document_id", policyId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissing(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const userIds = rows
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id));
  const campusIds = rows
    .map((row) => row.campus_id)
    .filter((id): id is string => Boolean(id));
  const nameByUser = new Map<string, string>();
  const nameByCampus = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", userIds);
    for (const profile of profiles ?? []) {
      nameByUser.set(
        String(profile.id),
        profile.full_name ||
          [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
          "Member",
      );
    }
  }

  if (campusIds.length > 0) {
    const { data: campuses } = await supabase
      .from("campuses")
      .select("id, name")
      .eq("church_id", churchId)
      .in("id", campusIds);
    for (const campus of campuses ?? []) {
      nameByCampus.set(String(campus.id), String(campus.name));
    }
  }

  return rows.map((row) => ({
    id: String(row.id),
    church_id: String(row.church_id),
    policy_document_id: String(row.policy_document_id),
    policy_version_id: row.policy_version_id
      ? String(row.policy_version_id)
      : null,
    assignment_type: row.assignment_type as PolicyAssignmentType,
    role: (row.role as MembershipRole | null) ?? null,
    campus_id: row.campus_id ? String(row.campus_id) : null,
    user_id: row.user_id ? String(row.user_id) : null,
    due_days: row.due_days != null ? Number(row.due_days) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    user_display_name: row.user_id
      ? nameByUser.get(String(row.user_id)) ?? "Member"
      : null,
    campus_name: row.campus_id
      ? nameByCampus.get(String(row.campus_id)) ?? null
      : null,
  }));
}

export async function listActiveChurchMembersForPolicies(churchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("church_memberships")
    .select("id, user_id, role")
    .eq("church_id", churchId)
    .eq("status", "active")
    .order("role", { ascending: true });

  if (error || !data) return [];

  const userIds = data.map((row) => String(row.user_id));
  const nameByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", userIds);
    for (const profile of profiles ?? []) {
      nameByUser.set(
        String(profile.id),
        profile.full_name ||
          [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
          "Member",
      );
    }
  }

  return data.map((row) => ({
    membershipId: String(row.id),
    userId: String(row.user_id),
    role: String(row.role),
    displayName: nameByUser.get(String(row.user_id)) ?? "Member",
  }));
}
