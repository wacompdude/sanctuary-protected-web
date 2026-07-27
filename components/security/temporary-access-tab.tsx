/**
 * components/security/temporary-access-tab.tsx
 * Manage temporary and time-limited access grants.
 */

"use client";

import { useEffect, useState } from "react";
import { Plus, Calendar, Clock, X, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listTemporaryAccessAction,
  listChurchUsersForSecurityAction,
  listPermissionCatalogAction,
  grantDirectUserPermissionAction,
  revokeDirectUserPermissionAction,
  type TemporaryGrantRow,
  type ChurchUserOption,
  type PermissionOption,
} from "@/app/(app)/settings/security/actions";

export function TemporaryAccessTab() {
  const [grants, setGrants] = useState<TemporaryGrantRow[]>([]);
  const [users, setUsers] = useState<ChurchUserOption[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    userId: "",
    permissionDefinitionId: "",
    effectiveDate: "",
    effectiveTime: "00:00",
    expiresDate: "",
    expiresTime: "23:59",
    reason: "",
  });

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [grantsResult, usersResult, catalogResult] = await Promise.all([
        listTemporaryAccessAction(),
        listChurchUsersForSecurityAction(),
        listPermissionCatalogAction(),
      ]);

      if (grantsResult.error) {
        setError(grantsResult.error);
        return;
      }
      if (usersResult.error) {
        setError(usersResult.error);
        return;
      }
      if (catalogResult.error) {
        setError(catalogResult.error);
        return;
      }

      setGrants(grantsResult.grants || []);
      setUsers(usersResult.users || []);
      setCatalog(catalogResult.permissions || []);
    } catch (err) {
      console.error("Error loading temporary access:", err);
      setError("Failed to load temporary access");
    } finally {
      setLoading(false);
    }
  }

  function toIso(date: string, time: string) {
    if (!date) return undefined;
    return new Date(`${date}T${time || "00:00"}:00`).toISOString();
  }

  async function handleGrantAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.userId || !formData.permissionDefinitionId || !formData.expiresDate) {
      setError("User, permission, and expiration date are required");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await grantDirectUserPermissionAction({
        userId: formData.userId,
        permissionDefinitionId: formData.permissionDefinitionId,
        effect: "grant",
        effectiveAt: toIso(formData.effectiveDate, formData.effectiveTime),
        expiresAt: toIso(formData.expiresDate, formData.expiresTime),
        reason: formData.reason.trim() || undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setShowGrantForm(false);
      setFormData({
        userId: "",
        permissionDefinitionId: "",
        effectiveDate: "",
        effectiveTime: "00:00",
        expiresDate: "",
        expiresTime: "23:59",
        reason: "",
      });
      await loadData();
    } catch (err) {
      console.error("Error granting temporary access:", err);
      setError("Failed to grant temporary access");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(grant: TemporaryGrantRow) {
    if (!confirm(`Revoke temporary access for ${grant.userName}?`)) return;
    try {
      setSaving(true);
      setError(null);
      const result = await revokeDirectUserPermissionAction({
        permissionId: grant.id,
        userId: grant.userId,
        permissionKey: grant.permissionKey,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await loadData();
    } catch (err) {
      console.error("Error revoking temporary access:", err);
      setError("Failed to revoke temporary access");
    } finally {
      setSaving(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200";
      case "active":
        return "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200";
      case "expired":
        return "bg-gray-100 dark:bg-gray-950 text-gray-800 dark:text-gray-200";
      default:
        return "bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200";
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading temporary access...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Temporary Access</h2>
          <p className="text-sm text-muted-foreground">Grant time-limited permissions to users</p>
        </div>
        <Button onClick={() => setShowGrantForm(!showGrantForm)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" />
          Grant Access
        </Button>
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-950 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {showGrantForm && (
        <Card>
          <CardHeader>
            <CardTitle>Grant Temporary Access</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGrantAccess} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">User *</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                    value={formData.userId}
                    onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                    disabled={saving}
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
                    value={formData.permissionDefinitionId}
                    onChange={(e) =>
                      setFormData({ ...formData, permissionDefinitionId: e.target.value })
                    }
                    disabled={saving}
                  >
                    <option value="">Select a permission...</option>
                    {catalog.map((permission) => (
                      <option key={permission.id} value={permission.id}>
                        [{permission.category}] {permission.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-3">Access Period *</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Effective Date</label>
                    <Input
                      type="date"
                      value={formData.effectiveDate}
                      onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Effective Time</label>
                    <Input
                      type="time"
                      value={formData.effectiveTime}
                      onChange={(e) => setFormData({ ...formData, effectiveTime: e.target.value })}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Expires Date *</label>
                    <Input
                      type="date"
                      value={formData.expiresDate}
                      onChange={(e) => setFormData({ ...formData, expiresDate: e.target.value })}
                      required
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Expires Time</label>
                    <Input
                      type="time"
                      value={formData.expiresTime}
                      onChange={(e) => setFormData({ ...formData, expiresTime: e.target.value })}
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              <Input
                placeholder="Reason for access"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                disabled={saving}
              />

              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={saving}>
                  {saving ? "Granting..." : "Grant Access"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowGrantForm(false)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3">Temporary Grants</h3>
        {grants.length === 0 ? (
          <div className="p-8 text-center border border-dashed rounded-lg">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">No temporary access grants yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grants.map((grant) => (
              <Card key={grant.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {grant.status === "active" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                        )}
                        <h4 className="font-semibold">{grant.userName}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">{grant.userEmail}</p>
                      <p className="text-sm font-medium mt-1">{grant.displayName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{grant.permissionKey}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {grant.effectiveAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Effective: {new Date(grant.effectiveAt).toLocaleString()}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires: {new Date(grant.expiresAt).toLocaleString()}
                        </span>
                      </div>
                      {grant.reason && (
                        <p className="mt-2 text-sm text-muted-foreground italic">Reason: {grant.reason}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${getStatusColor(grant.status)}`}>
                        {grant.status}
                      </span>
                      {grant.status !== "expired" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={saving}
                          onClick={() => void handleRevoke(grant)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
