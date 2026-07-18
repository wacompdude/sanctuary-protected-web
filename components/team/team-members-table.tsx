"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateTeamMemberRole,
  updateTeamMemberStatus,
} from "@/app/(app)/team/manage-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ActionState } from "@/lib/church/types";
import type { MembershipRole } from "@/lib/church/types";
import { labelForMembershipRole } from "@/lib/church/invitations";
import {
  canChangeRole,
  canChangeStatus,
  formatTeamDate,
  labelForMembershipStatus,
  rolesActorMayAssign,
  type TeamMemberRow,
} from "@/lib/church/team";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "suspended":
      return "secondary";
    case "removed":
      return "outline";
    default:
      return "outline";
  }
}

function MemberActions({
  member,
  actorRole,
  actorUserId,
  canManageCertifications,
}: {
  member: TeamMemberRow;
  actorRole: MembershipRole;
  actorUserId: string;
  canManageCertifications: boolean;
}) {
  const router = useRouter();
  const [roleState, roleAction, rolePending] = useActionState(
    updateTeamMemberRole,
    initialState,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    updateTeamMemberStatus,
    initialState,
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (roleState.success || statusState.success) {
      router.refresh();
    }
  }, [roleState.success, statusState.success, router]);

  useEffect(() => {
    setError(roleState.error || statusState.error || null);
  }, [roleState.error, statusState.error]);

  const assignableRoles = rolesActorMayAssign(actorRole).filter((role) =>
    canChangeRole({
      actorRole,
      actorUserId,
      targetUserId: member.userId,
      targetRole: member.role,
      targetStatus: member.status,
      nextRole: role,
    }),
  );

  const canSuspend = canChangeStatus({
    actorRole,
    actorUserId,
    targetUserId: member.userId,
    targetRole: member.role,
    targetStatus: member.status,
    nextStatus: "suspended",
    isLastActiveOwner: member.isLastActiveOwner,
  });

  const canRemove = canChangeStatus({
    actorRole,
    actorUserId,
    targetUserId: member.userId,
    targetRole: member.role,
    targetStatus: member.status,
    nextStatus: "removed",
    isLastActiveOwner: member.isLastActiveOwner,
  });

  const canReactivate = canChangeStatus({
    actorRole,
    actorUserId,
    targetUserId: member.userId,
    targetRole: member.role,
    targetStatus: member.status,
    nextStatus: "active",
    isLastActiveOwner: member.isLastActiveOwner,
  });

  const canAddCertification =
    canManageCertifications && member.status === "active";

  const busy = rolePending || statusPending || isPending;
  const hasActions =
    assignableRoles.length > 0 ||
    canSuspend ||
    canRemove ||
    canReactivate ||
    canAddCertification;

  if (!hasActions) {
    if (member.role === "owner") {
      return (
        <p className="text-xs text-muted-foreground">
          Transfer ownership from Ownership settings
        </p>
      );
    }
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const runStatus = (
    status: "active" | "suspended" | "removed",
    label: string,
  ) => {
    const needsConfirm = status === "suspended" || status === "removed";
    if (needsConfirm) {
      const ok = window.confirm(
        `${label} ${member.name} (${member.email ?? "no email"})?\n\nThis does not delete historical records.`,
      );
      if (!ok) return;
    }

    const formData = new FormData();
    formData.set("membership_id", member.membershipId);
    formData.set("status", status);
    if (needsConfirm) formData.set("confirmed", "1");

    startTransition(() => {
      statusAction(formData);
    });
  };

  return (
    <div className="flex min-w-[12rem] flex-col gap-2">
      {assignableRoles.length > 0 && (
        <form
          action={(formData) => {
            startTransition(() => {
              roleAction(formData);
            });
          }}
          className="flex items-center gap-2"
        >
          <input
            type="hidden"
            name="membership_id"
            value={member.membershipId}
          />
          <label className="sr-only" htmlFor={`role-${member.membershipId}`}>
            Change role
          </label>
          <select
            id={`role-${member.membershipId}`}
            name="role"
            defaultValue={member.role}
            disabled={busy}
            className="h-8 max-w-[11rem] rounded-md border border-input bg-background px-2 text-xs"
            onChange={(event) => {
              if (event.currentTarget.value === member.role) return;
              event.currentTarget.form?.requestSubmit();
            }}
          >
            {!assignableRoles.includes(
              member.role as (typeof assignableRoles)[number],
            ) && (
              <option value={member.role}>
                {labelForMembershipRole(member.role)}
              </option>
            )}
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {labelForMembershipRole(role)}
              </option>
            ))}
          </select>
        </form>
      )}

      <div className="flex flex-wrap gap-1.5">
        {canAddCertification && (
          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
            <Link
              href={`/certifications/new?membershipId=${encodeURIComponent(member.membershipId)}`}
            >
              Add certification
            </Link>
          </Button>
        )}
        {canSuspend && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-xs"
            onClick={() => runStatus("suspended", "Suspend")}
          >
            Suspend
          </Button>
        )}
        {canReactivate && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7 text-xs"
            onClick={() => runStatus("active", "Reactivate")}
          >
            Reactivate
          </Button>
        )}
        {canRemove && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            className="h-7 text-xs"
            onClick={() => runStatus("removed", "Remove")}
          >
            Remove
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TeamMembersTable({
  members,
  actorRole,
  actorUserId,
  canManageCertifications = false,
}: {
  members: TeamMemberRow[];
  actorRole: MembershipRole;
  actorUserId: string;
  canManageCertifications?: boolean;
}) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No church members yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Name</th>
            <th className="pb-3 pr-4 font-medium">Email</th>
            <th className="pb-3 pr-4 font-medium">Role</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium">Joined</th>
            <th className="pb-3 pr-4 font-medium">Updated</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr
              key={member.membershipId}
              className={cn(
                "border-b border-border last:border-0",
                member.status === "removed" && "opacity-70",
              )}
            >
              <td className="py-3 pr-4 align-top font-medium">{member.name}</td>
              <td className="py-3 pr-4 align-top text-muted-foreground">
                {member.email ?? "—"}
              </td>
              <td className="py-3 pr-4 align-top">
                {labelForMembershipRole(member.role)}
              </td>
              <td className="py-3 pr-4 align-top">
                <Badge variant={statusBadgeVariant(member.status)}>
                  {labelForMembershipStatus(member.status)}
                </Badge>
              </td>
              <td className="py-3 pr-4 align-top text-muted-foreground">
                {formatTeamDate(member.joinedAt)}
              </td>
              <td className="py-3 pr-4 align-top text-muted-foreground">
                {formatTeamDate(member.updatedAt)}
              </td>
              <td className="py-3 align-top">
                <MemberActions
                  member={member}
                  actorRole={actorRole}
                  actorUserId={actorUserId}
                  canManageCertifications={canManageCertifications}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
