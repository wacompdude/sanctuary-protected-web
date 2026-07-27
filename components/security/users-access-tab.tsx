/**
 * components/security/users-access-tab.tsx
 * Manage user permissions and access control.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Shield, Clock, AlertCircle, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listUsersAccessAction,
  getUserAccessDetailsAction,
  listPermissionCatalogAction,
  grantDirectUserPermissionAction,
  revokeDirectUserPermissionAction,
  type UserAccessRow,
  type UserPermissionRow,
  type PermissionOption,
} from "@/app/(app)/settings/security/actions";

export function UsersAccessTab() {
  const [users, setUsers] = useState<UserAccessRow[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; description: string | null; status: string }>>([]);
  const [permissions, setPermissions] = useState<UserPermissionRow[]>([]);
  const [selectedPermissionId, setSelectedPermissionId] = useState("");
  const [effect, setEffect] = useState<"grant" | "deny">("grant");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);
      const [usersResult, catalogResult] = await Promise.all([
        listUsersAccessAction(),
        listPermissionCatalogAction(),
      ]);
      if (usersResult.error) {
        setError(usersResult.error);
        return;
      }
      if (catalogResult.error) {
        setError(catalogResult.error);
        return;
      }
      setUsers(usersResult.users || []);
      setCatalog(catalogResult.permissions || []);
    } catch (err) {
      console.error("Error loading users:", err);
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(userId: string) {
    try {
      setDetailsLoading(true);
      setError(null);
      const result = await getUserAccessDetailsAction(userId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setGroups(result.groups || []);
      setPermissions(result.permissions || []);
    } catch (err) {
      console.error("Error loading user details:", err);
      setError("Failed to load user access details");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function toggleUser(userId: string) {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    setSelectedPermissionId("");
    setReason("");
    setEffect("grant");
    await loadDetails(userId);
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedUser || !selectedPermissionId) {
      setError("Select a permission to assign");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await grantDirectUserPermissionAction({
        userId: expandedUser,
        permissionDefinitionId: selectedPermissionId,
        effect,
        reason: reason.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedPermissionId("");
      setReason("");
      await Promise.all([loadDetails(expandedUser), loadUsers()]);
    } catch (err) {
      console.error("Error granting permission:", err);
      setError("Failed to assign permission");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(permission: UserPermissionRow) {
    if (!expandedUser) return;
    if (!confirm(`Revoke ${permission.displayName} for this user?`)) return;

    try {
      setSaving(true);
      setError(null);
      const result = await revokeDirectUserPermissionAction({
        permissionId: permission.id,
        userId: expandedUser,
        permissionKey: permission.permissionKey,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await Promise.all([loadDetails(expandedUser), loadUsers()]);
    } catch (err) {
      console.error("Error revoking permission:", err);
      setError("Failed to revoke permission");
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.email || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "active" ? user.status === "active" : user.status !== "active");
      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, filterStatus]);

  if (loading) {
    return <div className="text-center py-8">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Users and Access</h2>
        <p className="text-sm text-muted-foreground">
          View church users, group memberships, and direct permissions
        </p>
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "active", "inactive"] as const).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className="capitalize"
            >
              {status === "all" ? "All Users" : status}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center border border-dashed rounded-lg">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">No users match your search.</p>
          </div>
        ) : (
          filteredUsers.map((user) => (
            <Card key={user.userId}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      onClick={() => void toggleUser(user.userId)}
                      className="p-1 hover:bg-accent rounded mt-0.5"
                    >
                      {expandedUser === user.userId ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    <div>
                      <h3 className="font-semibold">{user.name}</h3>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                        <span>Role: <span className="font-medium capitalize">{user.role.replace(/_/g, " ")}</span></span>
                        <span>
                          Status:{" "}
                          <span className={user.status === "active" ? "text-green-600 dark:text-green-400 font-medium" : "font-medium"}>
                            {user.status}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                      <Shield className="h-3 w-3" />
                      {user.groupCount} Groups
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200 rounded text-xs font-medium">
                      {user.directPermissionCount} Direct
                    </span>
                    {user.temporaryPermissionCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200 rounded text-xs font-medium">
                        <Clock className="h-3 w-3" />
                        {user.temporaryPermissionCount} Temp
                      </span>
                    )}
                  </div>
                </div>

                {expandedUser === user.userId && (
                  <div className="mt-6 pt-6 border-t space-y-4">
                    {detailsLoading ? (
                      <p className="text-sm text-muted-foreground">Loading access details...</p>
                    ) : (
                      <>
                        <div>
                          <h4 className="font-medium mb-2">Assigned Groups</h4>
                          {groups.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No security group memberships.</p>
                          ) : (
                            <div className="space-y-2">
                              {groups.map((group) => (
                                <div key={group.id} className="p-3 border rounded-lg text-sm">
                                  <p className="font-medium">{group.name}</p>
                                  {group.description && (
                                    <p className="text-muted-foreground">{group.description}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Direct Permissions</h4>
                          {permissions.length === 0 ? (
                            <p className="text-sm text-muted-foreground mb-3">No direct permissions.</p>
                          ) : (
                            <div className="space-y-2 mb-3">
                              {permissions.map((permission) => (
                                <div key={permission.id} className="flex items-start justify-between gap-3 p-3 border rounded-lg">
                                  <div>
                                    <p className="text-sm font-medium">
                                      {permission.displayName}{" "}
                                      <span className="text-xs uppercase text-muted-foreground">
                                        ({permission.effect})
                                      </span>
                                    </p>
                                    <p className="font-mono text-xs text-muted-foreground">
                                      {permission.permissionKey}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Status: {permission.status}
                                      {permission.expiresAt
                                        ? ` · Expires ${new Date(permission.expiresAt).toLocaleString()}`
                                        : ""}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    disabled={saving}
                                    onClick={() => void handleRevoke(permission)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          <form onSubmit={handleGrant} className="space-y-3 p-3 border rounded-lg">
                            <p className="text-sm font-medium">Assign direct permission</p>
                            <select
                              className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                              value={selectedPermissionId}
                              onChange={(e) => setSelectedPermissionId(e.target.value)}
                              disabled={saving}
                            >
                              <option value="">Select permission...</option>
                              {catalog.map((permission) => (
                                <option key={permission.id} value={permission.id}>
                                  [{permission.category}] {permission.displayName}
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <select
                                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                                value={effect}
                                onChange={(e) => setEffect(e.target.value as "grant" | "deny")}
                                disabled={saving}
                              >
                                <option value="grant">Grant</option>
                                <option value="deny">Deny</option>
                              </select>
                              <Input
                                placeholder="Reason (optional)"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                disabled={saving}
                              />
                            </div>
                            <Button type="submit" size="sm" className="gap-2" disabled={saving || !selectedPermissionId}>
                              <Plus className="h-4 w-4" />
                              {saving ? "Saving..." : "Assign Permission"}
                            </Button>
                          </form>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
