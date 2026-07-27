/**
 * components/security/settings-tab.tsx
 * Access preview and high-risk permission reference.
 */

"use client";

import { useEffect, useState } from "react";
import { Eye, AlertTriangle, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listChurchUsersForSecurityAction,
  listPermissionCatalogAction,
  listCampusesForSecurityAction,
  previewAccessAction,
  type ChurchUserOption,
  type PermissionOption,
  type CampusOption,
} from "@/app/(app)/settings/security/actions";

export function SettingsTab() {
  const [users, setUsers] = useState<ChurchUserOption[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState({
    userId: "",
    permissionKey: "",
    campusId: "",
    featureDate: new Date().toISOString().split("T")[0],
    featureTime: new Date().toTimeString().slice(0, 5),
  });
  const [previewResult, setPreviewResult] = useState<{
    allowed: boolean;
    reason: string;
    source?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    void loadOptions();
  }, []);

  async function loadOptions() {
    try {
      setLoading(true);
      setError(null);
      const [usersResult, catalogResult, campusesResult] = await Promise.all([
        listChurchUsersForSecurityAction(),
        listPermissionCatalogAction(),
        listCampusesForSecurityAction(),
      ]);

      if (usersResult.error) {
        setError(usersResult.error);
        return;
      }
      if (catalogResult.error) {
        setError(catalogResult.error);
        return;
      }
      if (campusesResult.error) {
        setError(campusesResult.error);
        return;
      }

      setUsers(usersResult.users || []);
      setCatalog(catalogResult.permissions || []);
      setCampuses(campusesResult.campuses || []);
    } catch (err) {
      console.error("Error loading settings options:", err);
      setError("Failed to load settings options");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccessPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!previewData.userId || !previewData.permissionKey) {
      setError("User and permission are required");
      return;
    }

    try {
      setPreviewing(true);
      setError(null);
      const actionDate = `${previewData.featureDate}T${previewData.featureTime}:00`;
      const result = await previewAccessAction({
        userId: previewData.userId,
        permissionKey: previewData.permissionKey,
        campusId: previewData.campusId || undefined,
        actionDate,
      });

      if (result.error) {
        setError(result.error);
        setPreviewResult(null);
        return;
      }

      setPreviewResult({
        allowed: Boolean(result.result?.allowed),
        reason: result.result?.reason || "UNKNOWN",
        source: result.result?.source,
        message: result.result?.message,
      });
    } catch (err) {
      console.error("Error previewing access:", err);
      setError("Failed to preview access");
    } finally {
      setPreviewing(false);
    }
  }

  const highRiskPermissions = catalog.filter((p) => p.riskLevel === "high");

  if (loading) {
    return <div className="text-center py-8">Loading security settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Security Settings</h2>
        <p className="text-sm text-muted-foreground">
          Test access and review high-risk permissions
        </p>
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            <CardTitle>Access Preview</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Uses the same authorization engine as the live application.
          </p>

          <form onSubmit={handleAccessPreview} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">User *</label>
                <select
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  value={previewData.userId}
                  onChange={(e) => setPreviewData({ ...previewData, userId: e.target.value })}
                  disabled={previewing}
                >
                  <option value="">Select a user...</option>
                  {users.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.name}
                      {user.email ? ` (${user.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Permission *</label>
                <select
                  className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                  value={previewData.permissionKey}
                  onChange={(e) =>
                    setPreviewData({ ...previewData, permissionKey: e.target.value })
                  }
                  disabled={previewing}
                >
                  <option value="">Select a permission...</option>
                  {catalog.map((permission) => (
                    <option key={permission.id} value={permission.permissionKey}>
                      [{permission.category}] {permission.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Campus (optional)</label>
              <select
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                value={previewData.campusId}
                onChange={(e) => setPreviewData({ ...previewData, campusId: e.target.value })}
                disabled={previewing}
              >
                <option value="">No campus filter</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Test Date</label>
                <Input
                  type="date"
                  value={previewData.featureDate}
                  onChange={(e) =>
                    setPreviewData({ ...previewData, featureDate: e.target.value })
                  }
                  disabled={previewing}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Test Time</label>
                <Input
                  type="time"
                  value={previewData.featureTime}
                  onChange={(e) =>
                    setPreviewData({ ...previewData, featureTime: e.target.value })
                  }
                  disabled={previewing}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button type="submit" disabled={previewing}>
                {previewing ? "Checking..." : "Check Access"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPreviewResult(null)}>
                Clear
              </Button>
            </div>
          </form>

          {previewResult && (
            <div
              className={`mt-6 pt-6 border-t p-4 rounded-lg ${
                previewResult.allowed
                  ? "bg-green-50 dark:bg-green-950"
                  : "bg-red-50 dark:bg-red-950"
              }`}
            >
              <p
                className={`font-semibold ${
                  previewResult.allowed
                    ? "text-green-900 dark:text-green-100"
                    : "text-red-900 dark:text-red-100"
                }`}
              >
                {previewResult.allowed ? "Access Allowed" : "Access Denied"}
              </p>
              <p
                className={`text-sm mt-2 ${
                  previewResult.allowed
                    ? "text-green-800 dark:text-green-200"
                    : "text-red-800 dark:text-red-200"
                }`}
              >
                {previewResult.message || previewResult.reason}
              </p>
              {previewResult.source && (
                <p className="text-xs mt-2 font-mono opacity-80">Source: {previewResult.source}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <CardTitle>High-Risk Permissions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {highRiskPermissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No high-risk permissions found in the catalog.
            </p>
          ) : (
            highRiskPermissions.map((permission) => (
              <div key={permission.id} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div>
                    <p className="font-semibold">{permission.displayName}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {permission.permissionKey}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200">
                    HIGH
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {permission.description || "No description"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            <CardTitle>Policy Notes</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Sensitive grants and access previews are written to the security audit log.</p>
          <p>Audit log records are immutable at the database layer.</p>
          <p>
            Prefer security groups for common access patterns. Use direct and temporary grants for
            exceptions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
