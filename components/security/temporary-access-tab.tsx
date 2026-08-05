/**
 * components/security/temporary-access-tab.tsx
 * Manage temporary and time-limited access grants.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Calendar,
  Clock,
  Trash2,
  Pencil,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listTemporaryAccessAction,
  listChurchUsersForSecurityAction,
  listPermissionCatalogAction,
  grantDirectUserPermissionAction,
  updateTemporaryAccessAction,
  deleteTemporaryAccessAction,
  type TemporaryGrantRow,
  type ChurchUserOption,
  type PermissionOption,
} from "@/app/(app)/settings/security/actions";

type GrantFormState = {
  userId: string;
  permissionDefinitionId: string;
  effectiveDate: string;
  effectiveTime: string;
  expiresDate: string;
  expiresTime: string;
  reason: string;
};

const EMPTY_FORM: GrantFormState = {
  userId: "",
  permissionDefinitionId: "",
  effectiveDate: "",
  effectiveTime: "00:00",
  expiresDate: "",
  expiresTime: "23:59",
  reason: "",
};

function splitIso(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "00:00" };
  const local = new Date(value);
  if (Number.isNaN(local.getTime())) return { date: "", time: "00:00" };
  const date = local.toISOString().slice(0, 10);
  // Prefer local wall-clock for editing in the browser timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  const localDate = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
  const localTime = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
  return { date: localDate || date, time: localTime };
}

export function TemporaryAccessTab() {
  const [grants, setGrants] = useState<TemporaryGrantRow[]>([]);
  const [users, setUsers] = useState<ChurchUserOption[]>([]);
  const [catalog, setCatalog] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<GrantFormState>(EMPTY_FORM);

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

  function resetForm() {
    setFormData(EMPTY_FORM);
    setShowGrantForm(false);
    setEditingGrantId(null);
  }

  function startCreate() {
    setEditingGrantId(null);
    setFormData(EMPTY_FORM);
    setShowGrantForm(true);
    setError(null);
  }

  function startEdit(grant: TemporaryGrantRow) {
    const effective = splitIso(grant.effectiveAt);
    const expires = splitIso(grant.expiresAt);
    setEditingGrantId(grant.id);
    setFormData({
      userId: grant.userId,
      permissionDefinitionId: grant.permissionDefinitionId,
      effectiveDate: effective.date,
      effectiveTime: effective.time,
      expiresDate: expires.date,
      expiresTime: expires.time,
      reason: grant.reason || "",
    });
    setShowGrantForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.permissionDefinitionId || !formData.expiresDate) {
      setError("Permission and expiration date are required");
      return;
    }
    if (!editingGrantId && !formData.userId) {
      setError("User, permission, and expiration date are required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (editingGrantId) {
        const result = await updateTemporaryAccessAction({
          permissionId: editingGrantId,
          permissionDefinitionId: formData.permissionDefinitionId,
          effect: "grant",
          effectiveAt: toIso(formData.effectiveDate, formData.effectiveTime) ?? null,
          expiresAt: toIso(formData.expiresDate, formData.expiresTime),
          reason: formData.reason.trim() || null,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
      } else {
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
      }

      resetForm();
      await loadData();
    } catch (err) {
      console.error("Error saving temporary access:", err);
      setError(
        editingGrantId
          ? "Failed to update temporary access"
          : "Failed to grant temporary access",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(grant: TemporaryGrantRow) {
    if (
      !confirm(
        `Delete temporary access for ${grant.userName} (${grant.displayName})?`,
      )
    ) {
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const result = await deleteTemporaryAccessAction({
        permissionId: grant.id,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (editingGrantId === grant.id) {
        resetForm();
      }
      await loadData();
    } catch (err) {
      console.error("Error deleting temporary access:", err);
      setError("Failed to delete temporary access");
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

  const isEditing = Boolean(editingGrantId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Temporary Access</h2>
          <p className="text-sm text-muted-foreground">
            Grant, edit, and remove time-limited permissions
          </p>
        </div>
        <Button onClick={startCreate} className="gap-2" size="sm">
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
            <CardTitle>
              {isEditing ? "Edit Temporary Access" : "Grant Temporary Access"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">User *</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm disabled:opacity-60"
                    value={formData.userId}
                    onChange={(e) =>
                      setFormData({ ...formData, userId: e.target.value })
                    }
                    disabled={saving || isEditing}
                  >
                    <option value="">Select a user...</option>
                    {users.map((user) => (
                      <option key={user.userId} value={user.userId}>
                        {user.name}
                        {user.email ? ` (${user.email})` : ""}
                      </option>
                    ))}
                  </select>
                  {isEditing ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      User cannot be changed. Delete and recreate to reassign.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Permission *
                  </label>
                  <select
                    className="w-full px-3 py-2 border rounded-md bg-background text-sm"
                    value={formData.permissionDefinitionId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        permissionDefinitionId: e.target.value,
                      })
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
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Effective Date
                    </label>
                    <Input
                      type="date"
                      value={formData.effectiveDate}
                      onChange={(e) =>
                        setFormData({ ...formData, effectiveDate: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Effective Time
                    </label>
                    <Input
                      type="time"
                      value={formData.effectiveTime}
                      onChange={(e) =>
                        setFormData({ ...formData, effectiveTime: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Expires Date *
                    </label>
                    <Input
                      type="date"
                      value={formData.expiresDate}
                      onChange={(e) =>
                        setFormData({ ...formData, expiresDate: e.target.value })
                      }
                      required
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Expires Time
                    </label>
                    <Input
                      type="time"
                      value={formData.expiresTime}
                      onChange={(e) =>
                        setFormData({ ...formData, expiresTime: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              <Input
                placeholder="Reason for access"
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                disabled={saving}
              />

              <div className="flex gap-2 pt-4 border-t">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? isEditing
                      ? "Saving..."
                      : "Granting..."
                    : isEditing
                      ? "Save changes"
                      : "Grant Access"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={saving}
                >
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
                      <p className="text-sm text-muted-foreground">
                        {grant.userEmail}
                      </p>
                      <p className="text-sm font-medium mt-1">{grant.displayName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {grant.permissionKey}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {grant.effectiveAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Effective:{" "}
                            {new Date(grant.effectiveAt).toLocaleString()}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires: {new Date(grant.expiresAt).toLocaleString()}
                        </span>
                      </div>
                      {grant.reason ? (
                        <p className="mt-2 text-sm text-muted-foreground italic">
                          Reason: {grant.reason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${getStatusColor(grant.status)}`}
                      >
                        {grant.status}
                      </span>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled={saving}
                          onClick={() => startEdit(grant)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          disabled={saving}
                          onClick={() => void handleDelete(grant)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
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
