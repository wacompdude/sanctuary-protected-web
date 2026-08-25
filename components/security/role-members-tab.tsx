/**
 * components/security/role-members-tab.tsx
 * Full member management for a security role (security group).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Clock,
  Plus,
  Search,
  Trash2,
  UserMinus,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { labelForMembershipRole } from "@/lib/organization/invitations";
import { labelForAssignmentStatus } from "@/lib/security/group-member-utils";
import type { ComputedAssignmentStatus } from "@/lib/security/group-member-utils";
import type { PermissionScopeType } from "@/lib/security/types";
import {
  bulkAddSecurityGroupMembersAction,
  bulkRemoveSecurityGroupMembersAction,
  extendSecurityGroupMemberAction,
  listCampusesForSecurityAction,
  listSecurityGroupMembersAction,
  previewRemoveGroupMemberImpactAction,
  removeSecurityGroupMemberAction,
  revokeSecurityGroupMemberNowAction,
  searchEligibleGroupMembersAction,
  updateSecurityGroupMemberAction,
  type EligibleMemberOption,
  type GroupMemberRow,
  type GroupMemberSummary,
} from "@/app/(app)/settings/security/actions";

interface RoleMembersTabProps {
  groupId: string;
  groupName: string;
  highRisk?: boolean;
}

type StatusFilter = "all" | ComputedAssignmentStatus | "permanent" | "temporary";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  expiring_soon:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  expired: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  revoked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function RoleMembersTab({
  groupId,
  groupName,
  highRisk = false,
}: RoleMembersTabProps) {
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [summary, setSummary] = useState<GroupMemberSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [eligible, setEligible] = useState<EligibleMemberOption[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [assignmentReason, setAssignmentReason] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [scopeType, setScopeType] =
    useState<PermissionScopeType>("all_current_future_campuses");
  const [campusId, setCampusId] = useState("");
  const [campuses, setCampuses] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [editingMember, setEditingMember] = useState<GroupMemberRow | null>(null);
  const [impactPreview, setImpactPreview] = useState<{
    willLose: Array<{ displayName: string }>;
    willRetain: Array<{ displayName: string; source: string }>;
  } | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listSecurityGroupMembersAction(groupId, {
        includeInactive: true,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMembers(result.members ?? []);
      setSummary(result.summary ?? null);
    } catch (err) {
      console.error(err);
      setError("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!showAddModal) return;
    void listCampusesForSecurityAction().then((result) => {
      if (result.campuses) setCampuses(result.campuses);
    });
  }, [showAddModal]);

  useEffect(() => {
    if (!showAddModal) return;
    const timer = window.setTimeout(() => {
      void searchEligibleGroupMembersAction({
        groupId,
        query: addSearch,
        limit: 50,
      }).then((result) => {
        if (result.users) setEligible(result.users);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [addSearch, groupId, showAddModal]);

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return members
      .filter((member) => {
        if (statusFilter === "permanent") return !member.isTemporary;
        if (statusFilter === "temporary") return member.isTemporary;
        if (statusFilter !== "all" && member.assignmentStatus !== statusFilter) {
          return false;
        }
        if (!query) return true;
        return (
          member.name.toLowerCase().includes(query) ||
          (member.email ?? "").toLowerCase().includes(query) ||
          member.churchRole.toLowerCase().includes(query) ||
          (member.campusName ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, searchQuery, statusFilter]);

  async function handleBulkAdd() {
    if (selectedUserIds.size === 0) {
      setError("Select at least one member");
      return;
    }
    if (highRisk && !assignmentReason.trim()) {
      setError("Assignment reason is required for high-risk roles");
      return;
    }
    if (
      highRisk &&
      !confirm(
        "This role provides elevated security access. Review the selected members carefully before continuing.",
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await bulkAddSecurityGroupMembersAction({
        groupId,
        userIds: [...selectedUserIds],
        effectiveAt: effectiveAt || null,
        expiresAt: expiresAt || null,
        campusId: scopeType === "selected_campuses" ? campusId || null : null,
        scopeType,
        assignmentReason: assignmentReason || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      const added = result.addedCount ?? 0;
      const failed = result.failedCount ?? 0;
      setMessage(
        failed > 0
          ? `${added} of ${added + failed} members were added.`
          : `${added} member${added === 1 ? "" : "s"} added to ${groupName}.`,
      );
      setShowAddModal(false);
      setSelectedUserIds(new Set());
      setAssignmentReason("");
      setEffectiveAt("");
      setExpiresAt("");
      await loadMembers();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(member: GroupMemberRow) {
    const preview = await previewRemoveGroupMemberImpactAction({
      groupId,
      userId: member.userId,
    });
    if (preview.error) {
      setError(preview.error);
      return;
    }
    setImpactPreview({
      willLose: preview.willLose ?? [],
      willRetain: preview.willRetain ?? [],
    });

    const confirmed = confirm(
      `Remove ${member.name} from ${groupName}?\n\nThey will lose ${preview.willLose?.length ?? 0} permission(s) inherited only from this role.`,
    );
    if (!confirmed) {
      setImpactPreview(null);
      return;
    }

    try {
      setSaving(true);
      const result = await removeSecurityGroupMemberAction({
        groupId,
        membershipId: member.membershipId,
        userId: member.userId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setImpactPreview(null);
      await loadMembers();
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkRemove() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Remove ${selectedIds.size} member${selectedIds.size === 1 ? "" : "s"} from ${groupName}?`,
      )
    ) {
      return;
    }
    try {
      setSaving(true);
      const result = await bulkRemoveSecurityGroupMembersAction({
        groupId,
        membershipIds: [...selectedIds],
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedIds(new Set());
      await loadMembers();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingMember) return;
    try {
      setSaving(true);
      const result = await updateSecurityGroupMemberAction({
        groupId,
        membershipId: editingMember.membershipId,
        effectiveAt: effectiveAt || null,
        expiresAt: expiresAt || null,
        campusId: scopeType === "selected_campuses" ? campusId || null : null,
        scopeType,
        assignmentReason: assignmentReason || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingMember(null);
      await loadMembers();
    } finally {
      setSaving(false);
    }
  }

  async function handleExtend(member: GroupMemberRow) {
    const next = prompt(
      "New expiration (YYYY-MM-DDTHH:mm)",
      member.expiresAt ?? "",
    );
    if (!next) return;
    try {
      setSaving(true);
      const result = await extendSecurityGroupMemberAction({
        groupId,
        membershipId: member.membershipId,
        expiresAt: next,
      });
      if (result.error) setError(result.error);
      else await loadMembers();
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(member: GroupMemberRow) {
    if (!confirm(`Revoke ${member.name}'s access to ${groupName} immediately?`)) {
      return;
    }
    try {
      setSaving(true);
      const result = await revokeSecurityGroupMemberNowAction({
        groupId,
        membershipId: member.membershipId,
        reason: "Revoked immediately by administrator",
      });
      if (result.error) setError(result.error);
      else await loadMembers();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-sm text-muted-foreground text-center">
        Loading members...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Members — {groupName}</h3>
          {highRisk ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              High-risk role — assignments require a reason and careful review.
            </p>
          ) : null}
        </div>
        <Button className="gap-2" onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4" />
          Add Members
        </Button>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Total", summary.total],
            ["Active", summary.active],
            ["Scheduled", summary.scheduled],
            ["Temporary", summary.temporary],
            ["Expiring soon", summary.expiringSoon],
            ["Expired / revoked", summary.expired + summary.revoked],
          ].map(([label, count]) => (
            <div key={label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{count}</p>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="expiring_soon">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
          <option value="permanent">Permanent</option>
          <option value="temporary">Temporary</option>
        </select>
        {selectedIds.size > 0 ? (
          <Button variant="destructive" size="sm" onClick={() => void handleBulkRemove()}>
            Remove {selectedIds.size} selected
          </Button>
        ) : null}
      </div>

      {filteredMembers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h4 className="font-medium">No members assigned</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            No one currently inherits permissions from this group.
          </p>
          <Button className="mt-4 gap-2" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Add Members
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map((member) => (
            <div
              key={member.membershipId}
              className="rounded-lg border p-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
            >
              <div className="flex items-start gap-3 min-w-0">
                <Checkbox
                  checked={selectedIds.has(member.membershipId)}
                  onCheckedChange={(checked) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(member.membershipId);
                      else next.delete(member.membershipId);
                      return next;
                    });
                  }}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{member.name}</p>
                    <Badge
                      className={
                        STATUS_BADGE[member.assignmentStatus] ??
                        "bg-muted text-foreground"
                      }
                    >
                      {labelForAssignmentStatus(member.assignmentStatus)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {member.email ?? "No email"} ·{" "}
                    {labelForMembershipRole(member.churchRole as never)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {member.campusName ?? member.scopeLabel} · Assigned by{" "}
                    {member.assignedByName} on {formatDate(member.assignedAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Effective {formatDate(member.effectiveAt)} · Expires{" "}
                    {formatDate(member.expiresAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingMember(member);
                    setEffectiveAt(member.effectiveAt ?? "");
                    setExpiresAt(member.expiresAt ?? "");
                    setScopeType(member.scopeType);
                    setAssignmentReason(member.assignmentReason ?? "");
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {member.isTemporary ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void handleExtend(member)}>
                      <Clock className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleRevoke(member)}>
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void handleRemove(member)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="max-h-[min(90dvh,40rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg">
            <h4 className="text-lg font-semibold">Add Members to {groupName}</h4>
            <Input
              className="mt-4"
              placeholder="Search members..."
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
            />
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {eligible.map((user) => (
                <label
                  key={user.userId}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    user.alreadyAssigned ? "opacity-60" : ""
                  }`}
                >
                  <Checkbox
                    disabled={user.alreadyAssigned}
                    checked={selectedUserIds.has(user.userId)}
                    onCheckedChange={(checked) => {
                      setSelectedUserIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(user.userId);
                        else next.delete(user.userId);
                        return next;
                      });
                    }}
                  />
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email ?? "No email"} ·{" "}
                      {labelForMembershipRole(user.role as never)}
                    </p>
                    {user.alreadyAssigned ? (
                      <p className="text-xs text-amber-700">Already assigned</p>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium">Effective</label>
                <Input
                  type="datetime-local"
                  value={effectiveAt}
                  onChange={(e) => setEffectiveAt(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Expires</label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium">Campus scope</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={scopeType}
                onChange={(e) =>
                  setScopeType(e.target.value as PermissionScopeType)
                }
              >
                <option value="all_current_future_campuses">
                  All permitted campuses
                </option>
                <option value="primary_campus">Member primary campus</option>
                <option value="selected_campuses">Selected campus</option>
              </select>
            </div>
            {scopeType === "selected_campuses" ? (
              <select
                className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
              >
                <option value="">Select campus...</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="mt-3">
              <label className="text-xs font-medium">
                Reason{highRisk ? " (required)" : " (optional)"}
              </label>
              <Input
                value={assignmentReason}
                onChange={(e) => setAssignmentReason(e.target.value)}
                placeholder="Why is this assignment being made?"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={saving || selectedUserIds.size === 0}
                onClick={() => void handleBulkAdd()}
              >
                Add {selectedUserIds.size || ""} Member
                {selectedUserIds.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editingMember ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="max-h-[min(90dvh,40rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg">
            <h4 className="font-semibold">Edit assignment — {editingMember.name}</h4>
            <div className="mt-4 grid gap-3">
              <Input
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
              />
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <Input
                value={assignmentReason}
                onChange={(e) => setAssignmentReason(e.target.value)}
                placeholder="Assignment reason"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingMember(null)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void handleSaveEdit()}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {impactPreview ? (
        <div className="hidden" aria-hidden>
          <Calendar />
        </div>
      ) : null}
    </div>
  );
}
