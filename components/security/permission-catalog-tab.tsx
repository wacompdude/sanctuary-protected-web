/**
 * components/security/permission-catalog-tab.tsx
 * View the live permission catalog from the database.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Lock, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listPermissionCatalogAction,
  type PermissionOption,
} from "@/app/(app)/settings/security/actions";

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
  const [expandedPermission, setExpandedPermission] = useState<string | null>(null);

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

  const categories = useMemo(() => {
    return Array.from(new Set(permissions.map((p) => p.category))).sort();
  }, [permissions]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return permissions.filter((permission) => {
      if (selectedCategory && permission.category !== selectedCategory) return false;
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
          Explore all available permissions ({filtered.length} of {permissions.length})
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
            <h3 className="text-lg font-semibold capitalize">{category.replace(/_/g, " ")}</h3>
            {items.map((permission) => (
              <Card
                key={permission.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() =>
                  setExpandedPermission(
                    expandedPermission === permission.id ? null : permission.id,
                  )
                }
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded">
                        <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold">{permission.displayName}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {permission.permissionKey}
                        </p>
                        {expandedPermission === permission.id && (
                          <div className="mt-3 space-y-2 text-sm">
                            <p className="text-muted-foreground">
                              {permission.description || "No description"}
                            </p>
                            <p>
                              Campus scope:{" "}
                              {permission.supportsCampusScope ? "Supported" : "Not supported"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          RISK_LEVEL_COLORS[permission.riskLevel] || RISK_LEVEL_COLORS.low
                        }`}
                      >
                        {permission.riskLevel}
                      </span>
                      {permission.riskLevel === "high" && (
                        <Lock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
