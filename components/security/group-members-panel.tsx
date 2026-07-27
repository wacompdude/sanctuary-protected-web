/**
 * components/security/group-members-panel.tsx
 * Add and remove members for a security group.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addSecurityGroupMemberAction,
  listChurchUsersForSecurityAction,
  listSecurityGroupMembersAction,
  removeSecurityGroupMemberAction,
  type ChurchUserOption,
  type GroupMemberRow,
} from "@/app/(app)/settings/security/actions";

interface GroupMembersPanelProps {
  groupId: string;
}

export function GroupMembersPanel({ groupId }: GroupMembersPanelProps) {
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [churchUsers, setChurchUsers] = useState<ChurchUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, [groupId]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [membersResult, usersResult] = await Promise.all([
        listSecurityGroupMembersAction(groupId),
        listChurchUsersForSecurityAction(),
      ]);

      if (membersResult.error) {
        setError(membersResult.error);
        return;
      }
      if (usersResult.error) {
        setError(usersResult.error);
        return;
      }

      setMembers(membersResult.members || []);
      setChurchUsers(usersResult.users || []);
    } catch (err) {
      console.error("Error loading group members:", err);
      setError("Failed to load group members");
    } finally {
      setLoading(false);
    }
  }

  const memberUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );

  const availableUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return churchUsers
      .filter((u) => !memberUserIds.has(u.userId))
      .filter((u) => {
        if (!query) return true;
        return (
          u.name.toLowerCase().includes(query) ||
          (u.email || "").toLowerCase().includes(query)
        );
      });
  }, [churchUsers, memberUserIds, userSearch]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) {
      setError("Select a user to add");
      return;
    }

    try {
      setAdding(true);
      setError(null);
      const result = await addSecurityGroupMemberAction({
        groupId,
        userId: selectedUserId,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSelectedUserId("");
      setUserSearch("");
      await loadData();
    } catch (err) {
      console.error("Error adding member:", err);
      setError("Failed to add member");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(member: GroupMemberRow) {
    if (!confirm(`Remove ${member.name} from this group?`)) {
      return;
    }

    try {
      setRemovingId(member.membershipId);
      setError(null);
      const result = await removeSecurityGroupMemberAction({
        groupId,
        membershipId: member.membershipId,
        userId: member.userId,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      await loadData();
    } catch (err) {
      console.error("Error removing member:", err);
      setError("Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-muted p-3 rounded text-sm text-muted-foreground">
        Loading members...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4" />
        <h4 className="font-medium">Members ({members.length})</h4>
      </div>

      {error && (
        <div className="p-3 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <form onSubmit={handleAddMember} className="space-y-3 p-3 border rounded-lg">
        <p className="text-sm font-medium">Add member</p>
        <Input
          placeholder="Search church members..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          disabled={adding}
        />
        <select
          className="w-full px-3 py-2 border rounded-md bg-background text-sm"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          disabled={adding}
        >
          <option value="">Select a user...</option>
          {availableUsers.map((user) => (
            <option key={user.userId} value={user.userId}>
              {user.name}
              {user.email ? ` (${user.email})` : ""} — {user.role}
            </option>
          ))}
        </select>
        {availableUsers.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {churchUsers.length === 0
              ? "No active church members found."
              : "All matching church members are already in this group."}
          </p>
        )}
        <Button type="submit" size="sm" className="gap-2" disabled={adding || !selectedUserId}>
          <Plus className="h-4 w-4" />
          {adding ? "Adding..." : "Add to Group"}
        </Button>
      </form>

      {members.length === 0 ? (
        <div className="p-3 border border-dashed rounded text-sm text-muted-foreground">
          No members yet. Add a church user above.
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.membershipId}
              className="flex items-center justify-between gap-3 p-3 border rounded-lg"
            >
              <div>
                <p className="font-medium text-sm">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[member.email, member.role].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Added {new Date(member.assignedAt).toLocaleDateString()}
                  {member.expiresAt
                    ? ` · Expires ${new Date(member.expiresAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={removingId === member.membershipId}
                onClick={() => handleRemoveMember(member)}
                title="Remove member"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
