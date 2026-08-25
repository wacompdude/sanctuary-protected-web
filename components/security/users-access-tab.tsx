/**
 * components/security/users-access-tab.tsx
 * Manage membership roles/status, campuses, groups, and permission overrides.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Shield,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  UserCog,
  MapPin,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listUsersAccessAction,
  getUserAccessDetailsAction,
  getUserMembershipEditorAction,
  listPermissionCatalogAction,
  grantDirectUserPermissionAction,
  revokeDirectUserPermissionAction,
  removeSecurityGroupMemberAction,
  updateUserMembershipRolesAction,
  updateUserMembershipStatusAction,
  type UserAccessRow,
  type UserPermissionRow,
  type UserGroupMembershipRow,
  type PermissionOption,
  type MemberCampusAssignment,
} from "@/app/(app)/settings/security/actions";
import { labelForMembershipRole } from "@/lib/organization/invitations";
import { labelForMembershipStatus } from "@/lib/organization/team";
import { labelForCampusRole } from "@/lib/campuses/constants";
import type { MembershipRole, MembershipStatus } from "@/lib/organization/types";
import { cn } from "@/lib/utils";

type FocusSection = "member" | "groups" | "direct" | "temporary";

export function UsersAccessTab() {
  const [users, setUsers] = useState<UserAccessRow[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [focusSection, setFocusSection] = useState<FocusSection>("member");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [groups, setGroups] = useState<UserGroupMembershipRow[]>([]);
  const [permissions, setPermissions] = useState<UserPermissionRow[]>([]);
  const [selectedPermissionId, setSelectedPermissionId] = useState("");
  const [effect, setEffect] = useState<"grant" | "deny">("grant");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [primaryRole, setPrimaryRole] = useState<MembershipRole>("viewer");
  const [secondaryRoles, setSecondaryRoles] = useState<MembershipRole[]>([]);
  const [memberStatus, setMemberStatus] = useState<MembershipStatus>("active");
  const [assignableRoles, setAssignableRoles] = useState<MembershipRole[]>([]);
  const [statusOptions, setStatusOptions] = useState<MembershipStatus[]>([]);
  const [campuses, setCampuses] = useState<MemberCampusAssignment[]>([]);
  const [roleLabels, setRoleLabels] = useState<Record<string, string>>({});

  const memberRef = useRef<HTMLDivElement | null>(null);
  const groupsRef = useRef<HTMLDivElement | null>(null);
  const directRef = useRef<HTMLDivElement | null>(null);
  const temporaryRef = useRef<HTMLDivElement | null>(null);

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
      const [accessResult, editorResult] = await Promise.all([
        getUserAccessDetailsAction(userId),
        getUserMembershipEditorAction(userId),
      ]);
      if (accessResult.error) {
        setError(accessResult.error);
        return;
      }
      if (editorResult.error) {
        setError(editorResult.error);
        return;
      }
      setGroups(accessResult.groups || []);
      setPermissions(accessResult.permissions || []);
      if (editorResult.member) {
        setPrimaryRole(editorResult.member.primaryRole);
        setSecondaryRoles(editorResult.member.secondaryRoles);
        setMemberStatus(editorResult.member.status);
      }
      setAssignableRoles(editorResult.assignableRoles || []);
      setStatusOptions(editorResult.statusOptions || []);
      setCampuses(editorResult.campuses || []);
      setRoleLabels(editorResult.roleLabels || {});
    } catch (err) {
      console.error("Error loading user details:", err);
      setError("Failed to load user access details");
    } finally {
      setDetailsLoading(false);
    }
  }

  function scrollToSection(section: FocusSection) {
    const target =
      section === "member"
        ? memberRef.current
        : section === "groups"
          ? groupsRef.current
          : section === "direct"
            ? directRef.current
            : temporaryRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function openUserSection(userId: string, section: FocusSection) {
    setFocusSection(section);
    setSelectedPermissionId("");
    setReason("");
    setEffect("grant");

    if (expandedUser !== userId) {
      setExpandedUser(userId);
      await loadDetails(userId);
    }

    requestAnimationFrame(() => scrollToSection(section));
  }

  async function toggleUser(userId: string) {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    await openUserSection(userId, "member");
  }

  function toggleSecondary(role: MembershipRole) {
    setSecondaryRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function handleSaveMembership() {
    if (!expandedUser) return;
    try {
      setSaving(true);
      setError(null);
      const [rolesResult, statusResult] = await Promise.all([
        updateUserMembershipRolesAction({
          userId: expandedUser,
          primaryRole,
          secondaryRoles: secondaryRoles.filter((role) => role !== primaryRole),
        }),
        updateUserMembershipStatusAction({
          userId: expandedUser,
          status: memberStatus,
        }),
      ]);
      if (rolesResult.error) {
        setError(rolesResult.error);
        return;
      }
      if (statusResult.error) {
        setError(statusResult.error);
        return;
      }
      await Promise.all([loadDetails(expandedUser), loadUsers()]);
    } catch (err) {
      console.error(err);
      setError("Failed to update membership");
    } finally {
      setSaving(false);
    }
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

  async function handleRemoveGroupMembership(
    membershipId: string,
    groupId: string,
  ) {
    if (!expandedUser) return;
    if (!confirm("Remove this group assignment from the member?")) return;
    try {
      setSaving(true);
      setError(null);
      const result = await removeSecurityGroupMemberAction({
        groupId,
        membershipId,
        userId: expandedUser,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await Promise.all([loadDetails(expandedUser), loadUsers()]);
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
        (filterStatus === "active"
          ? user.status === "active"
          : user.status !== "active");
      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, filterStatus]);

  const permanentPermissions = permissions.filter((p) => !p.expiresAt);
  const temporaryPermissions = permissions.filter((p) => Boolean(p.expiresAt));
  const secondaryChoices = assignableRoles.filter((role) => role !== primaryRole);

  if (loading) {
    return <div className="text-center py-8">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Users and Access</h2>
        <p className="text-sm text-muted-foreground">
          Edit primary/secondary roles, status, campus assignments, groups, and
          permission overrides.
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
                      type="button"
                      onClick={() => void toggleUser(user.userId)}
                      className="p-1 hover:bg-accent rounded mt-0.5"
                      aria-expanded={expandedUser === user.userId}
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
                        <span>
                          Role:{" "}
                          <span className="font-medium">
                            {labelForMembershipRole(user.role)}
                          </span>
                        </span>
                        <span>
                          Status:{" "}
                          <span
                            className={
                              user.status === "active"
                                ? "text-green-600 dark:text-green-400 font-medium"
                                : "font-medium"
                            }
                          >
                            {labelForMembershipStatus(user.status)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => void openUserSection(user.userId, "member")}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                        "bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200",
                        expandedUser === user.userId && focusSection === "member"
                          ? "ring-2 ring-slate-400"
                          : null,
                      )}
                    >
                      <UserCog className="h-3 w-3" />
                      Member
                    </button>
                    <button
                      type="button"
                      onClick={() => void openUserSection(user.userId, "groups")}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                        "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200",
                        expandedUser === user.userId && focusSection === "groups"
                          ? "ring-2 ring-blue-400"
                          : null,
                      )}
                    >
                      <Shield className="h-3 w-3" />
                      {user.groupCount} Groups
                    </button>
                    <button
                      type="button"
                      onClick={() => void openUserSection(user.userId, "direct")}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                        "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200",
                        expandedUser === user.userId && focusSection === "direct"
                          ? "ring-2 ring-purple-400"
                          : null,
                      )}
                    >
                      {user.directPermissionCount} Direct
                    </button>
                    {user.temporaryPermissionCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          void openUserSection(user.userId, "temporary")
                        }
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                          "bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200",
                          expandedUser === user.userId &&
                            focusSection === "temporary"
                            ? "ring-2 ring-orange-400"
                            : null,
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {user.temporaryPermissionCount} Temp
                      </button>
                    ) : null}
                  </div>
                </div>

                {expandedUser === user.userId && (
                  <div className="mt-6 pt-6 border-t space-y-4">
                    {detailsLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading access details...
                      </p>
                    ) : (
                      <>
                        <div
                          ref={memberRef}
                          className={cn(
                            "rounded-lg p-1 -m-1 space-y-3",
                            focusSection === "member"
                              ? "ring-1 ring-slate-300 dark:ring-slate-700"
                              : null,
                          )}
                        >
                          <h4 className="font-medium">Membership editor</h4>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">
                                Primary role
                              </label>
                              <select
                                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                                value={primaryRole}
                                onChange={(e) => {
                                  const next = e.target.value as MembershipRole;
                                  setPrimaryRole(next);
                                  setSecondaryRoles((prev) =>
                                    prev.filter((role) => role !== next),
                                  );
                                }}
                                disabled={saving}
                              >
                                {assignableRoles.map((role) => (
                                  <option key={role} value={role}>
                                    {roleLabels[role] ||
                                      labelForMembershipRole(role)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">
                                Status
                              </label>
                              <select
                                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                                value={memberStatus}
                                onChange={(e) =>
                                  setMemberStatus(
                                    e.target.value as MembershipStatus,
                                  )
                                }
                                disabled={saving}
                              >
                                {statusOptions.map((status) => (
                                  <option key={status} value={status}>
                                    {labelForMembershipStatus(status)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">
                              Secondary roles
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {secondaryChoices.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No secondary roles available.
                                </p>
                              ) : (
                                secondaryChoices.map((role) => {
                                  const checked = secondaryRoles.includes(role);
                                  return (
                                    <label
                                      key={role}
                                      className={cn(
                                        "inline-flex items-center gap-2 px-2 py-1 border rounded text-xs cursor-pointer",
                                        checked
                                          ? "bg-blue-50 border-blue-300 dark:bg-blue-950"
                                          : null,
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleSecondary(role)}
                                        disabled={saving}
                                      />
                                      {roleLabels[role] ||
                                        labelForMembershipRole(role)}
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h5 className="text-sm font-medium inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              Campus assignments
                            </h5>
                            {campuses.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No campus assignments. Manage campus memberships
                                from each campus page.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {campuses.map((campus) => (
                                  <div
                                    key={campus.id}
                                    className="text-sm border rounded px-2 py-1.5"
                                  >
                                    <p className="font-medium">
                                      {campus.campusName}
                                      {campus.isPrimaryCampus
                                        ? " · Primary"
                                        : ""}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {labelForCampusRole(campus.campusRole)} ·{" "}
                                      {campus.status}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => void handleSaveMembership()}
                          >
                            {saving ? "Saving..." : "Save membership"}
                          </Button>
                        </div>

                        <div
                          ref={groupsRef}
                          className={cn(
                            "rounded-lg p-1 -m-1",
                            focusSection === "groups"
                              ? "ring-1 ring-blue-300 dark:ring-blue-700"
                              : null,
                          )}
                        >
                          <h4 className="font-medium mb-2">Groups</h4>
                          {groups.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No permission group assignments. Church role
                              permissions still apply.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {groups.map((group) => (
                                <div
                                  key={group.membershipId}
                                  className="flex items-start justify-between gap-3 p-3 border rounded-lg text-sm"
                                >
                                  <div>
                                    <p className="font-medium">{group.name}</p>
                                    <p className="text-muted-foreground">
                                      {group.campusName ?? group.scopeLabel} ·{" "}
                                      {group.assignmentStatus}
                                      {group.expiresAt
                                        ? ` · Expires ${new Date(group.expiresAt).toLocaleDateString()}`
                                        : " · No expiration"}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                    disabled={saving}
                                    onClick={() =>
                                      void handleRemoveGroupMembership(
                                        group.membershipId,
                                        group.id,
                                      )
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div
                          ref={directRef}
                          className={cn(
                            "rounded-lg p-1 -m-1",
                            focusSection === "direct"
                              ? "ring-1 ring-purple-300 dark:ring-purple-700"
                              : null,
                          )}
                        >
                          <h4 className="font-medium mb-2">
                            Permission overrides
                          </h4>
                          {permanentPermissions.length === 0 ? (
                            <p className="text-sm text-muted-foreground mb-3">
                              No ongoing direct permissions.
                            </p>
                          ) : (
                            <div className="space-y-2 mb-3">
                              {permanentPermissions.map((permission) => (
                                <PermissionRow
                                  key={permission.id}
                                  permission={permission}
                                  saving={saving}
                                  onRevoke={() => void handleRevoke(permission)}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        <div
                          ref={temporaryRef}
                          className={cn(
                            "rounded-lg p-1 -m-1",
                            focusSection === "temporary"
                              ? "ring-1 ring-orange-300 dark:ring-orange-700"
                              : null,
                          )}
                        >
                          <h4 className="font-medium mb-2">
                            Temporary Permissions
                          </h4>
                          {temporaryPermissions.length === 0 ? (
                            <p className="text-sm text-muted-foreground mb-3">
                              No temporary direct permissions.
                            </p>
                          ) : (
                            <div className="space-y-2 mb-3">
                              {temporaryPermissions.map((permission) => (
                                <PermissionRow
                                  key={permission.id}
                                  permission={permission}
                                  saving={saving}
                                  onRevoke={() => void handleRevoke(permission)}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        <form
                          onSubmit={(e) => void handleGrant(e)}
                          className="space-y-3 p-3 border rounded-lg"
                        >
                          <p className="text-sm font-medium">
                            Assign permission override
                          </p>
                          <select
                            className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                            value={selectedPermissionId}
                            onChange={(e) =>
                              setSelectedPermissionId(e.target.value)
                            }
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
                              onChange={(e) =>
                                setEffect(e.target.value as "grant" | "deny")
                              }
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
                          <Button
                            type="submit"
                            size="sm"
                            className="gap-2"
                            disabled={saving || !selectedPermissionId}
                          >
                            <Plus className="h-4 w-4" />
                            {saving ? "Saving..." : "Assign Permission"}
                          </Button>
                        </form>
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

function PermissionRow({
  permission,
  saving,
  onRevoke,
}: {
  permission: UserPermissionRow;
  saving: boolean;
  onRevoke: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 border rounded-lg">
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
        onClick={onRevoke}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
