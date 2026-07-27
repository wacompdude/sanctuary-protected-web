/**
 * components/security/group-permissions-panel.tsx
 * Assign and remove permissions for a security group.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addSecurityGroupPermissionAction,
  listPermissionCatalogAction,
  listSecurityGroupPermissionsAction,
  removeSecurityGroupPermissionAction,
  type GroupPermissionRow,
  type PermissionOption,
} from "@/app/(app)/settings/security/actions";
import type { PermissionScopeType } from "@/lib/security/types";

interface GroupPermissionsPanelProps {
  groupId: string;
}

const SCOPE_OPTIONS: { value: PermissionScopeType; label: string }[] = [
  { value: "all_current_future_campuses", label: "All current & future campuses" },
  { value: "all_current_campuses", label: "All current campuses only" },
  { value: "primary_campus", label: "User's primary campus" },
  { value: "no_restriction", label: "No campus restriction" },
];

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
  medium: "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200",
  high: "bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200",
};

export function GroupPermissionsPanel({ groupId }: GroupPermissionsPanelProps) {
  const [assigned, setAssigned] = useState<GroupPermissionRow[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPermissionId, setSelectedPermissionId] = useState("");
  const [scopeType, setScopeType] = useState<PermissionScopeType>("all_current_future_campuses");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, [groupId]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [assignedResult, catalogResult] = await Promise.all([
        listSecurityGroupPermissionsAction(groupId),
        listPermissionCatalogAction(),
      ]);

      if (assignedResult.error) {
        setError(assignedResult.error);
        return;
      }
      if (catalogResult.error) {
        setError(catalogResult.error);
        return;
      }

      setAssigned(assignedResult.permissions || []);
      setCatalog(catalogResult.permissions || []);
    } catch (err) {
      console.error("Error loading group permissions:", err);
      setError("Failed to load group permissions");
    } finally {
      setLoading(false);
    }
  }

  const assignedIds = useMemo(
    () => new Set(assigned.map((p) => p.permissionDefinitionId)),
    [assigned],
  );

  const availablePermissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog
      .filter((p) => !assignedIds.has(p.id))
      .filter((p) => {
        if (!query) return true;
        return (
          p.displayName.toLowerCase().includes(query) ||
          p.permissionKey.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          (p.description || "").toLowerCase().includes(query)
        );
      });
  }, [catalog, assignedIds, search]);

  async function handleAddPermission(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPermissionId) {
      setError("Select a permission to assign");
      return;
    }

    try {
      setAdding(true);
      setError(null);
      const result = await addSecurityGroupPermissionAction({
        groupId,
        permissionDefinitionId: selectedPermissionId,
        scopeType,
        reason: reason.trim() || undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSelectedPermissionId("");
      setSearch("");
      setReason("");
      setScopeType("all_current_future_campuses");
      await loadData();
    } catch (err) {
      console.error("Error assigning permission:", err);
      setError("Failed to assign permission");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemovePermission(permission: GroupPermissionRow) {
    if (!confirm(`Remove "${permission.displayName}" from this group?`)) {
      return;
    }

    try {
      setRemovingId(permission.assignmentId);
      setError(null);
      const result = await removeSecurityGroupPermissionAction({
        groupId,
        assignmentId: permission.assignmentId,
        permissionDefinitionId: permission.permissionDefinitionId,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      await loadData();
    } catch (err) {
      console.error("Error removing permission:", err);
      setError("Failed to remove permission");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-muted p-3 rounded text-sm text-muted-foreground">
        Loading permissions...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" />
        <h4 className="font-medium">Assigned Permissions ({assigned.length})</h4>
      </div>

      {error && (
        <div className="p-3 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <form onSubmit={handleAddPermission} className="space-y-3 p-3 border rounded-lg">
        <p className="text-sm font-medium">Assign permission</p>
        <Input
          placeholder="Search permissions by name, key, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={adding}
        />
        <select
          className="w-full px-3 py-2 border rounded-md bg-background text-sm"
          value={selectedPermissionId}
          onChange={(e) => setSelectedPermissionId(e.target.value)}
          disabled={adding}
        >
          <option value="">Select a permission...</option>
          {availablePermissions.map((permission) => (
            <option key={permission.id} value={permission.id}>
              [{permission.category}] {permission.displayName} ({permission.permissionKey})
            </option>
          ))}
        </select>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Campus scope</label>
          <select
            className="w-full px-3 py-2 border rounded-md bg-background text-sm"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as PermissionScopeType)}
            disabled={adding}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={adding}
        />

        {availablePermissions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {catalog.length === 0
              ? "No permissions found. Run migration 058_permission_definitions.sql if the catalog is empty."
              : "All matching permissions are already assigned to this group."}
          </p>
        )}

        <Button
          type="submit"
          size="sm"
          className="gap-2"
          disabled={adding || !selectedPermissionId}
        >
          <Plus className="h-4 w-4" />
          {adding ? "Assigning..." : "Assign Permission"}
        </Button>
      </form>

      {assigned.length === 0 ? (
        <div className="p-3 border border-dashed rounded text-sm text-muted-foreground">
          No permissions assigned yet. Add one above.
        </div>
      ) : (
        <div className="space-y-2">
          {assigned.map((permission) => (
            <div
              key={permission.assignmentId}
              className="flex items-start justify-between gap-3 p-3 border rounded-lg"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm">{permission.displayName}</p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      RISK_COLORS[permission.riskLevel] || RISK_COLORS.low
                    }`}
                  >
                    {permission.riskLevel}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {permission.permissionKey}
                </p>
                {permission.description && (
                  <p className="text-xs text-muted-foreground mt-1">{permission.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Scope: {permission.scopeType.replace(/_/g, " ")} · Assigned{" "}
                  {new Date(permission.assignedAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive shrink-0"
                disabled={removingId === permission.assignmentId}
                onClick={() => handleRemovePermission(permission)}
                title="Remove permission"
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
