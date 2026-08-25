"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  delegateCampusAccessAction,
  revokeCampusDelegationAction,
} from "@/app/(app)/campuses/delegation-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CAMPUS_DELEGATION_TEMPLATES,
  type CampusDelegationTemplateKey,
  type DelegatedCampusManagerRow,
} from "@/lib/campuses/campus-policy";
import { labelForMembershipRole } from "@/lib/organization/invitations";

type Candidate = {
  userId: string;
  name: string;
  role: string;
};

export function CampusDelegatedManagersPanel({
  campusId,
  campusName,
  managers,
  candidates,
}: {
  campusId: string;
  campusName: string;
  managers: DelegatedCampusManagerRow[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [templateKey, setTemplateKey] = useState<CampusDelegationTemplateKey>(
    CAMPUS_DELEGATION_TEMPLATES[0]?.key ?? "campus_member_manager",
  );
  const [effectiveAt, setEffectiveAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const assignedIds = useMemo(
    () => new Set(managers.filter((row) => row.status === "active" || row.status === "scheduled" || row.status === "expiring_soon").map((row) => row.userId)),
    [managers],
  );

  const available = candidates.filter((row) => {
    if (assignedIds.has(row.userId)) return false;
    const query = userSearch.trim().toLowerCase();
    if (!query) return true;
    return row.name.toLowerCase().includes(query);
  });

  function handleDelegate() {
    setError(null);
    startTransition(async () => {
      const result = await delegateCampusAccessAction({
        campusId,
        campusName,
        userId,
        templateKey,
        effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        assignmentReason: reason || null,
        administrativeNotes: notes || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setUserId("");
      setReason("");
      setNotes("");
      router.refresh();
    });
  }

  function handleRevoke(row: DelegatedCampusManagerRow) {
    if (
      !window.confirm(
        `Revoke ${row.name}'s ${row.groupName} access for ${campusName}? Their other church permissions stay the same.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await revokeCampusDelegationAction({
        campusId,
        membershipId: row.membershipId,
        userId: row.userId,
        groupId: row.groupId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Delegated managers</CardTitle>
            <CardDescription>
              People granted campus member-management authority for {campusName}.
              They cannot create, delete, or reconfigure this campus.
            </CardDescription>
          </div>
          <Button
            type="button"
            className="h-11"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "Cancel" : "+ Delegate campus access"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {showForm ? (
            <div className="space-y-3 rounded-md border border-border p-4">
              <div className="space-y-2">
                <Label htmlFor="delegate-search">Member</Label>
                <Input
                  id="delegate-search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search church members"
                />
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                >
                  <option value="">Select a member</option>
                  {available.map((row) => (
                    <option key={row.userId} value={row.userId}>
                      {row.name} · {labelForMembershipRole(row.role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delegate-role">Approved delegated role</Label>
                <select
                  id="delegate-role"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={templateKey}
                  onChange={(event) =>
                    setTemplateKey(event.target.value as CampusDelegationTemplateKey)
                  }
                >
                  {CAMPUS_DELEGATION_TEMPLATES.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {
                    CAMPUS_DELEGATION_TEMPLATES.find((item) => item.key === templateKey)
                      ?.description
                  }
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="effective-at">Effective date</Label>
                  <Input
                    id="effective-at"
                    type="datetime-local"
                    value={effectiveAt}
                    onChange={(event) => setEffectiveAt(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to start immediately.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires-at">Expiration date</Label>
                  <Input
                    id="expires-at"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for no expiration.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delegate-reason">Reason</Label>
                <Input
                  id="delegate-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="North Campus volunteer coordinator"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delegate-notes">Administrative notes</Label>
                <Input
                  id="delegate-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <Button
                type="button"
                className="h-11"
                disabled={pending || !userId}
                onClick={handleDelegate}
              >
                {pending ? "Saving…" : "Delegate access"}
              </Button>
            </div>
          ) : null}

          {managers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No delegated campus managers yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-3 font-medium text-muted-foreground">
                      Member
                    </th>
                    <th className="pb-2 pr-3 font-medium text-muted-foreground">
                      Role
                    </th>
                    <th className="pb-2 pr-3 font-medium text-muted-foreground">
                      Scope
                    </th>
                    <th className="pb-2 pr-3 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-2 pr-3 font-medium text-muted-foreground">
                      Dates
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {managers.map((row) => (
                    <tr key={row.membershipId} className="border-b border-border last:border-0">
                      <td className="py-3 pr-3">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.churchRole
                            ? labelForMembershipRole(row.churchRole)
                            : "Member"}
                        </p>
                      </td>
                      <td className="py-3 pr-3">
                        {row.groupName}
                        <p className="text-xs text-muted-foreground">
                          {row.permissions.slice(0, 3).join(", ")}
                          {row.permissions.length > 3 ? "…" : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-3">{row.campusName}</td>
                      <td className="py-3 pr-3 capitalize">
                        {row.status.replaceAll("_", " ")}
                      </td>
                      <td className="py-3 pr-3 text-xs text-muted-foreground">
                        {row.effectiveAt
                          ? `From ${new Date(row.effectiveAt).toLocaleDateString()}`
                          : "Immediate"}
                        <br />
                        {row.expiresAt
                          ? `Until ${new Date(row.expiresAt).toLocaleDateString()}`
                          : "No expiration"}
                        <br />
                        Assigned by {row.assignedByName}
                      </td>
                      <td className="py-3">
                        {row.status === "revoked" || row.status === "expired" ? null : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-10"
                            disabled={pending}
                            onClick={() => handleRevoke(row)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
