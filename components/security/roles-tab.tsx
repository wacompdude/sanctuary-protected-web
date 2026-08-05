/**
 * components/security/roles-tab.tsx
 * System role catalog: list with inline expand/collapse details.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Power,
  Shield,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  duplicateRoleAsGroupAction,
  getRoleDetailAction,
  listRolesCatalogAction,
  setRoleCatalogStatusAction,
  updateRoleCatalogAction,
  type RoleCatalogRow,
} from "@/app/(app)/settings/security/actions";
import { cn } from "@/lib/utils";

type RoleDetailResult = Awaited<ReturnType<typeof getRoleDetailAction>>;

export function RolesTab() {
  const [roles, setRoles] = useState<RoleCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "church" | "campus">(
    "church",
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoleDetailResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const expandedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadRoles();
  }, []);

  async function loadRoles() {
    try {
      setLoading(true);
      setError(null);
      const result = await listRolesCatalogAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setRoles(result.roles || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(role: RoleCatalogRow) {
    setDetailLoading(true);
    setError(null);
    try {
      const result = await getRoleDetailAction({
        roleKind: role.roleKind,
        roleKey: role.roleKey,
      });
      setDetail(result);
      if (result.success && result.role) {
        setEditName(result.role.displayName);
        setEditDescription(result.role.description);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load role detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleRole(role: RoleCatalogRow) {
    const key = `${role.roleKind}:${role.roleKey}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      setDetail(null);
      return;
    }

    setExpandedKey(key);
    setDetail(null);
    await loadDetail(role);
    requestAnimationFrame(() => {
      expandedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function collapseRole() {
    setExpandedKey(null);
    setDetail(null);
  }

  async function refreshExpanded() {
    if (!detail?.success || !detail.role) return;
    const role = roles.find(
      (row) =>
        row.roleKind === detail.role!.roleKind &&
        row.roleKey === detail.role!.roleKey,
    );
    await loadRoles();
    if (role) {
      await loadDetail(role);
    } else if (detail.role) {
      await loadDetail({
        roleKind: detail.role.roleKind,
        roleKey: detail.role.roleKey,
        displayName: editName || detail.role.displayName,
        description: editDescription || detail.role.description,
        status: detail.role.status,
        isSystem: detail.role.isSystem,
        userCount: 0,
        permissionCount: 0,
        defaultPermissionKeys: [],
      });
    }
  }

  async function handleSave() {
    if (!detail?.success || !detail.role) return;
    try {
      setSaving(true);
      setError(null);
      const result = await updateRoleCatalogAction({
        roleKind: detail.role.roleKind,
        roleKey: detail.role.roleKey,
        displayName: editName,
        description: editDescription,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await refreshExpanded();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!detail?.success || !detail.role) return;
    const next = detail.role.status === "active" ? "inactive" : "active";
    if (
      next === "inactive" &&
      !confirm(
        `Deactivate ${detail.role.displayName}? It will be hidden from assignment menus.`,
      )
    ) {
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const result = await setRoleCatalogStatusAction({
        roleKind: detail.role.roleKind,
        roleKey: detail.role.roleKey,
        status: next,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await refreshExpanded();
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!detail?.success || !detail.role) return;
    try {
      setSaving(true);
      setError(null);
      const result = await duplicateRoleAsGroupAction({
        roleKind: detail.role.roleKind,
        roleKey: detail.role.roleKey,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      alert(
        `Created security group from this role. Open the Groups tab to review (id: ${result.groupId}).`,
      );
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    return roles.filter((role) =>
      kindFilter === "all" ? true : role.roleKind === kindFilter,
    );
  }, [roles, kindFilter]);

  if (loading) {
    return <div className="text-center py-8">Loading roles...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Roles</h2>
        <p className="text-sm text-muted-foreground">
          Church and campus role templates. Click a role to expand its details
          below the name.
        </p>
      </div>

      {error ? (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["church", "campus", "all"] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={kindFilter === kind ? "default" : "outline"}
            onClick={() => {
              setKindFilter(kind);
              collapseRole();
            }}
            className="capitalize"
          >
            {kind === "all" ? "All" : kind}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center border border-dashed rounded-lg">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">No roles in this filter.</p>
          </div>
        ) : (
          filtered.map((role) => {
            const key = `${role.roleKind}:${role.roleKey}`;
            const isExpanded = expandedKey === key;

            return (
              <Card
                key={key}
                className={cn(isExpanded ? "ring-2 ring-blue-400" : null)}
              >
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex items-start gap-3 min-w-0 text-left flex-1"
                      onClick={() => void toggleRole(role)}
                      aria-expanded={isExpanded}
                    >
                      <span className="p-1 rounded mt-0.5 shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{role.displayName}</h3>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted">
                            {role.roleKind}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
                              role.status === "active"
                                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
                            )}
                          >
                            {role.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {role.description}
                        </p>
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {role.roleKind === "church"
                              ? `${role.userCount} users`
                              : "Campus assignments"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            {role.permissionCount} defaults
                          </span>
                        </div>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 shrink-0"
                      onClick={() => void toggleRole(role)}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          View
                        </>
                      )}
                    </Button>
                  </div>

                  {isExpanded ? (
                    <div
                      ref={expandedRef}
                      className="mt-2 pt-4 border-t space-y-5"
                    >
                      {detailLoading ? (
                        <p className="text-sm text-muted-foreground">
                          Loading role details...
                        </p>
                      ) : detail?.error ? (
                        <div className="p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800">
                          {detail.error}
                        </div>
                      ) : detail?.success && detail.role ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={saving}
                                onClick={() => void handleSave()}
                              >
                                <Pencil className="h-4 w-4" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={saving}
                                onClick={() => void handleDuplicate()}
                              >
                                <Copy className="h-4 w-4" />
                                Duplicate
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                disabled={
                                  saving ||
                                  detail.role.roleKey === "owner" ||
                                  detail.role.roleKey === "co_owner"
                                }
                                onClick={() => void handleToggleStatus()}
                              >
                                <Power className="h-4 w-4" />
                                {detail.role.status === "active"
                                  ? "Deactivate"
                                  : "Activate"}
                              </Button>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={collapseRole}
                            >
                              Collapse
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                              Display name
                            </label>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              disabled={saving}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                              Description
                            </label>
                            <textarea
                              className="w-full min-h-24 px-3 py-2 border rounded-md bg-background text-sm"
                              value={editDescription}
                              onChange={(e) =>
                                setEditDescription(e.target.value)
                              }
                              disabled={saving}
                            />
                          </div>

                          <div>
                            <h4 className="font-medium mb-1">
                              Campus restrictions
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {detail.role.campusRestrictions}
                            </p>
                          </div>

                          <div>
                            <h4 className="font-medium mb-2">
                              Default permissions
                            </h4>
                            {detail.permissions.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No default permissions mapped.
                              </p>
                            ) : (
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {detail.permissions.map((permission) => (
                                  <div
                                    key={permission.permissionKey}
                                    className="text-xs border rounded px-2 py-1.5"
                                  >
                                    <span className="font-medium">
                                      {permission.displayName}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · {permission.permissionKey}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {detail.role.roleKind === "church" ? (
                            <div>
                              <h4 className="font-medium mb-2">
                                Assigned members
                              </h4>
                              {detail.members.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No members currently assigned.
                                </p>
                              ) : (
                                <div className="max-h-40 overflow-y-auto space-y-2">
                                  {detail.members.map((member) => (
                                    <div
                                      key={`${member.userId}-${member.isPrimary}`}
                                      className="text-sm border rounded px-2 py-1.5"
                                    >
                                      <p className="font-medium">
                                        {member.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {member.email || "No email"} ·{" "}
                                        {member.isPrimary
                                          ? "Primary"
                                          : "Secondary"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}

                          <div>
                            <h4 className="font-medium mb-2">Role history</h4>
                            {detail.history.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No recent audit events for this role.
                              </p>
                            ) : (
                              <div className="max-h-40 overflow-y-auto space-y-2">
                                {detail.history.map((event) => (
                                  <div
                                    key={event.id}
                                    className="text-xs border rounded px-2 py-1.5"
                                  >
                                    <p className="font-medium">
                                      {event.eventType}
                                    </p>
                                    <p className="text-muted-foreground">
                                      {new Date(
                                        event.createdAt,
                                      ).toLocaleString()}
                                      {event.reason ? ` · ${event.reason}` : ""}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
