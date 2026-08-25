/**
 * components/security/security-group-detail.tsx
 * Tabbed detail view for a security role (security group).
 */

"use client";

import { useEffect, useState } from "react";
import { GroupPermissionsPanel } from "@/components/security/group-permissions-panel";
import { RoleMembersTab } from "@/components/security/role-members-tab";
import {
  getSecurityGroupDetailAction,
  type GroupMemberSummary,
} from "@/app/(app)/settings/security/actions";
import type { SecurityGroup } from "@/lib/security/types";
import { cn } from "@/lib/utils";

interface SecurityGroupDetailProps {
  groupId: string;
  initialSection?: "overview" | "members" | "permissions";
}

type DetailSection = "overview" | "members" | "permissions";

export function SecurityGroupDetail({
  groupId,
  initialSection = "members",
}: SecurityGroupDetailProps) {
  const [group, setGroup] = useState<SecurityGroup | null>(null);
  const [summary, setSummary] = useState<GroupMemberSummary | null>(null);
  const [permissionCount, setPermissionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<DetailSection>(initialSection);

  useEffect(() => {
    void loadDetail();
  }, [groupId]);

  async function loadDetail() {
    try {
      setLoading(true);
      setError(null);
      const result = await getSecurityGroupDetailAction(groupId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setGroup(result.group ?? null);
      setSummary(result.summary ?? null);
      setPermissionCount(result.permissionCount ?? 0);
    } catch (err) {
      console.error(err);
      setError("Failed to load role details");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="py-6 text-sm text-muted-foreground">Loading role...</div>;
  }

  if (error || !group) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {error ?? "Role not found"}
      </div>
    );
  }

  const sections: Array<{ id: DetailSection; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members" },
    { id: "permissions", label: "Permissions" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium",
              section === item.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === "overview" ? (
      <div className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold">{group.name}</h3>
          <p className="text-sm text-muted-foreground">
            {group.description || "No description provided."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Members</p>
            <p className="text-2xl font-semibold">{summary?.active ?? 0} active</p>
            <button
              type="button"
              className="mt-2 text-sm text-blue-600 hover:underline"
              onClick={() => setSection("members")}
            >
              Manage members
            </button>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Permissions</p>
            <p className="text-2xl font-semibold">{permissionCount}</p>
            <button
              type="button"
              className="mt-2 text-sm text-blue-600 hover:underline"
              onClick={() => setSection("permissions")}
            >
              Manage permissions
            </button>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Temporary assignments</p>
            <p className="text-2xl font-semibold">{summary?.temporary ?? 0}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Expiring soon</p>
            <p className="text-2xl font-semibold">{summary?.expiringSoon ?? 0}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Status: {group.status}
          {group.high_risk ? " · High-risk role" : ""}
        </p>
      </div>
      ) : null}

      {section === "members" ? (
        <RoleMembersTab
          groupId={group.id}
          groupName={group.name}
          highRisk={Boolean(group.high_risk)}
        />
      ) : null}

      {section === "permissions" ? (
        <GroupPermissionsPanel groupId={group.id} />
      ) : null}
    </div>
  );
}
