/**
 * components/security/security-groups-tab.tsx
 * Manage security groups, their members, and permissions.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, Copy, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listSecurityGroupsAction,
  createSecurityGroupAction,
  updateSecurityGroupAction,
  duplicateSecurityGroupAction,
  deactivateSecurityGroupAction,
} from "@/app/(app)/settings/security/actions";
import { SecurityGroup } from "@/lib/security/types";
import { GroupMembersPanel } from "@/components/security/group-members-panel";
import { GroupPermissionsPanel } from "@/components/security/group-permissions-panel";

interface ExpandedGroup {
  [key: string]: boolean;
}

export function SecurityGroupsTab() {
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<ExpandedGroup>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      setLoading(true);
      setError(null);
      const result = await listSecurityGroupsAction();

      if (result.error) {
        setError(result.error);
        return;
      }

      setGroups(result.groups || []);
    } catch (err) {
      console.error("Error loading groups:", err);
      setError("Failed to load security groups");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) {
      setError("Group name is required");
      return;
    }

    try {
      setCreating(true);
      const result = await createSecurityGroupAction({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setNewGroupName("");
      setNewGroupDescription("");
      setShowCreateForm(false);
      await loadGroups();
    } catch (err) {
      console.error("Error creating group:", err);
      setError("Failed to create security group");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(group: SecurityGroup) {
    setEditingGroupId(group.id);
    setEditName(group.name);
    setEditDescription(group.description || "");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGroupId || !editName.trim()) {
      setError("Group name is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await updateSecurityGroupAction({
        groupId: editingGroupId,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingGroupId(null);
      await loadGroups();
    } catch (err) {
      console.error("Error updating group:", err);
      setError("Failed to update security group");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(groupId: string) {
    try {
      setSaving(true);
      setError(null);
      const result = await duplicateSecurityGroupAction(groupId);
      if (result.error) {
        setError(result.error);
        return;
      }
      await loadGroups();
    } catch (err) {
      console.error("Error duplicating group:", err);
      setError("Failed to duplicate security group");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(group: SecurityGroup) {
    if (!confirm(`Deactivate security group "${group.name}"? Members will no longer inherit its permissions.`)) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await deactivateSecurityGroupAction(group.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      await loadGroups();
    } catch (err) {
      console.error("Error deactivating group:", err);
      setError("Failed to deactivate security group");
    } finally {
      setSaving(false);
    }
  }

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  }, []);

  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-8">Loading security groups...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Security Groups</h2>
          <p className="text-sm text-muted-foreground">Organize permissions by creating security groups</p>
        </div>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New Group
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="font-medium text-red-900 dark:text-red-100">Error</p>
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Security Group</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Group Name *</label>
                <Input
                  placeholder="e.g., Camera Feed Operators"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Input
                  placeholder="Brief description of this group's purpose"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Group"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewGroupName("");
                    setNewGroupDescription("");
                  }}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div>
        <Input
          placeholder="Search groups by name or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Groups List */}
      <div className="space-y-3">
        {filteredGroups.length === 0 ? (
          <div className="p-8 text-center border border-dashed rounded-lg">
            <p className="text-muted-foreground">
              {groups.length === 0
                ? "No security groups yet. Create one to get started."
                : "No groups match your search."}
            </p>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <Card key={group.id}>
              <CardContent className="pt-6">
                {/* Group Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleGroupExpanded(group.id)}
                        className="p-1 hover:bg-accent rounded"
                      >
                        {expandedGroups[group.id] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                      <div>
                        <h3 className="font-semibold">{group.name}</h3>
                        {group.description && (
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      <span>Status: <span className={group.status === "active" ? "text-green-600 dark:text-green-400" : "text-gray-600"}>{group.status}</span></span>
                      <span>Created: {new Date(group.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Edit group"
                      disabled={saving}
                      onClick={() => startEdit(group)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Duplicate group"
                      disabled={saving}
                      onClick={() => void handleDuplicate(group.id)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Deactivate group"
                      className="text-destructive hover:text-destructive"
                      disabled={saving}
                      onClick={() => void handleDeactivate(group)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {editingGroupId === group.id && (
                  <form onSubmit={handleSaveEdit} className="mt-4 space-y-3 p-3 border rounded-lg">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Group name"
                      disabled={saving}
                    />
                    <Input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description"
                      disabled={saving}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => setEditingGroupId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}

                {/* Expanded Details */}
                {expandedGroups[group.id] && (
                  <div className="mt-6 pt-6 border-t space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Group ID</p>
                        <p className="font-mono text-xs">{group.id}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Church ID</p>
                        <p className="font-mono text-xs">{group.church_id}</p>
                      </div>
                    </div>

                    {/* Members Section */}
                    <GroupMembersPanel groupId={group.id} />

                    {/* Permissions Section */}
                    <GroupPermissionsPanel groupId={group.id} />

                    {/* Notes */}
                    {group.notes && (
                      <div>
                        <h4 className="font-medium mb-2">Notes</h4>
                        <p className="text-sm bg-muted p-3 rounded">{group.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Info Box */}
      <div className="p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          💡 <strong>Tip:</strong> Use security groups to organize users and assign permissions in bulk. You can also use system templates as a starting point.
        </p>
      </div>
    </div>
  );
}
