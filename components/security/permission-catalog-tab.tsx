/**
 * components/security/permission-catalog-tab.tsx
 * View the live permission catalog from the database.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Lock, Eye, Users, Clock, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listPermissionCatalogAction,
  listPermissionGrantHoldersAction,
  type PermissionOption,
  type PermissionGrantHolderRow,
} from "@/app/(app)/settings/security/actions";
import { cn } from "@/lib/utils";

const RISK_LEVEL_COLORS: Record<string, string> = {
  low: "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
  medium: "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200",
  high: "bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200",
};

export function PermissionCatalogTab() {
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedPermission, setExpandedPermission] = useState<string | null>(
    null,
  );
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holdersError, setHoldersError] = useState<string | null>(null);
  const [holders, setHolders] = useState<PermissionGrantHolderRow[]>([]);
  const [holdersSummary, setHoldersSummary] = useState<{
    directCount: number;
    groupCount: number;
    uniqueUsers: number;
  } | null>(null);

  useEffect(() => {
    void loadCatalog();
  }, []);

  async function loadCatalog() {
    try {
      setLoading(true);
      setError(null);
      const result = await listPermissionCatalogAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setPermissions(result.permissions || []);
    } catch (err) {
      console.error("Error loading permission catalog:", err);
      setError("Failed to load permission catalog");
    } finally {
      setLoading(false);
    }
  }

  async function loadHolders(permissionDefinitionId: string) {
    try {
      setHoldersLoading(true);
      setHoldersError(null);
      const result = await listPermissionGrantHoldersAction(
        permissionDefinitionId,
      );
      if (result.error) {
        setHoldersError(result.error);
        setHolders([]);
        setHoldersSummary(null);
        return;
      }
      setHolders(result.holders || []);
      setHoldersSummary(result.summary || null);
    } catch (err) {
      console.error("Error loading permission holders:", err);
      setHoldersError("Failed to load who has this permission");
      setHolders([]);
      setHoldersSummary(null);
    } finally {
      setHoldersLoading(false);
    }
  }

  async function togglePermission(permissionId: string) {
    if (expandedPermission === permissionId) {
      setExpandedPermission(null);
      setHolders([]);
      setHoldersSummary(null);
      setHoldersError(null);
      return;
    }
    setExpandedPermission(permissionId);
    await loadHolders(permissionId);
  }

  const categories = useMemo(() => {
    return Array.from(new Set(permissions.map((p) => p.category))).sort();
  }, [permissions]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return permissions.filter((permission) => {
      if (selectedCategory && permission.category !== selectedCategory)
        return false;
      if (!query) return true;
      return (
        permission.displayName.toLowerCase().includes(query) ||
        permission.permissionKey.toLowerCase().includes(query) ||
        permission.category.toLowerCase().includes(query) ||
        (permission.description || "").toLowerCase().includes(query)
      );
    });
  }, [permissions, searchQuery, selectedCategory]);

  const grouped = useMemo(() => {
    const map: Record<string, PermissionOption[]> = {};
    for (const permission of filtered) {
      if (!map[permission.category]) map[permission.category] = [];
      map[permission.category].push(permission);
    }
    return map;
  }, [filtered]);

  if (loading) {
    return <div className="text-center py-8">Loading permission catalog...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Permission Catalog</h2>
        <p className="text-sm text-muted-foreground">
          Explore all available permissions ({filtered.length} of{" "}
          {permissions.length}). Click a permission to see who has access.
        </p>
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
            If the catalog is empty, run migration 058_permission_definitions.sql.
          </p>
        </div>
      )}

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, key, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategory(null)}
        >
          All Categories
        </Button>
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category)}
            className="capitalize"
          >
            {category.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="p-8 text-center border border-dashed rounded-lg text-muted-foreground">
          No permissions match your search.
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-lg font-semibold capitalize">
              {category.replace(/_/g, " ")}
            </h3>
            {items.map((permission) => {
              const isExpanded = expandedPermission === permission.id;
              return (
                <Card
                  key={permission.id}
                  className={cn(
                    "transition-colors",
                    isExpanded ? "ring-1 ring-blue-300 dark:ring-blue-700" : null,
                  )}
                >
                  <CardContent className="pt-6">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void togglePermission(permission.id)}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded">
                            <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {permission.displayName}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {permission.permissionKey}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {isExpanded
                                ? "Hide who has access"
                                : "Click to see who has access"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              RISK_LEVEL_COLORS[permission.riskLevel] ||
                              RISK_LEVEL_COLORS.low
                            }`}
                          >
                            {permission.riskLevel}
                          </span>
                          {permission.riskLevel === "high" && (
                            <Lock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          )}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-4 space-y-4 border-t pt-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2 text-sm">
                            <p className="text-muted-foreground">
                              {permission.description || "No description"}
                            </p>
                            <p>
                              Campus scope:{" "}
                              {permission.supportsCampusScope
                                ? "Supported"
                                : "Not supported"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void togglePermission(permission.id)}
                          >
                            Close
                          </Button>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <h4 className="font-medium flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Who has access
                            </h4>
                            {holdersSummary ? (
                              <span className="text-xs text-muted-foreground">
                                {holdersSummary.uniqueUsers} users ·{" "}
                                {holdersSummary.directCount} direct ·{" "}
                                {holdersSummary.groupCount} via groups
                              </span>
                            ) : null}
                          </div>

                          {holdersLoading ? (
                            <p className="text-sm text-muted-foreground">
                              Loading grant holders...
                            </p>
                          ) : holdersError ? (
                            <p className="text-sm text-red-700 dark:text-red-300">
                              {holdersError}
                            </p>
                          ) : holders.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No church users currently have this permission via
                              direct grant or security group.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {holders.map((holder) => (
                                <div
                                  key={`${holder.source}:${holder.userId}:${holder.groupId || "direct"}:${holder.effect}`}
                                  className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium">{holder.userName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {holder.userEmail || "No email"}
                                      {holder.userRole
                                        ? ` · ${holder.userRole.replace(/_/g, " ")}`
                                        : ""}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {holder.source === "direct" ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-800 dark:bg-purple-950 dark:text-purple-200">
                                          Direct
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                                          <Shield className="h-3 w-3" />
                                          {holder.groupName || "Group"}
                                        </span>
                                      )}
                                      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                                        {holder.effect}
                                      </span>
                                      {holder.isTemporary ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-800 dark:bg-orange-950 dark:text-orange-200">
                                          <Clock className="h-3 w-3" />
                                          Temporary
                                        </span>
                                      ) : null}
                                    </div>
                                    {holder.expiresAt ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Expires{" "}
                                        {new Date(
                                          holder.expiresAt,
                                        ).toLocaleString()}
                                      </p>
                                    ) : null}
                                    {holder.reason ? (
                                      <p className="mt-1 text-xs italic text-muted-foreground">
                                        {holder.reason}
                                      </p>
                                    ) : null}
                                  </div>
                                  <span className="text-xs capitalize text-muted-foreground">
                                    {holder.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void togglePermission(permission.id)}
                            >
                              Close list
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
