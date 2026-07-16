"use client";

import { useActionState, useEffect, useMemo, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  addIncidentTeamMember,
  removeIncidentTeamMember,
} from "@/app/(app)/incidents/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { labelForMembershipRole } from "@/lib/church/invitations";
import type { TeamMemberRow } from "@/lib/church/team";
import { selectClassName } from "@/components/incidents/incident-badges";
import type { ActionState, IncidentInvolvedMember } from "@/lib/incidents/types";

const initialState: ActionState = {};

function RemoveIncidentTeamMemberButton({
  memberId,
  incidentId,
  canManage,
}: {
  memberId: string;
  incidentId: string;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      disabled={pending}
      aria-label="Remove involved member"
      onClick={() => {
        startTransition(async () => {
          await removeIncidentTeamMember(memberId, incidentId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function optionLabel(member: TeamMemberRow) {
  const secondary = member.email ? ` (${member.email})` : "";
  return `${member.name}${secondary} - ${labelForMembershipRole(member.role)}`;
}

export function IncidentTeamMembersCard({
  incidentId,
  members,
  availableMembers,
  canManage,
}: {
  incidentId: string;
  members: IncidentInvolvedMember[];
  availableMembers: TeamMemberRow[];
  canManage: boolean;
}) {
  const boundAction = addIncidentTeamMember.bind(null, incidentId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `incident-team-members-form-${incidentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, incidentId]);

  const openOptions = useMemo(() => {
    const selected = new Set(members.map((member) => member.membership_id));
    return availableMembers.filter((member) => !selected.has(member.membershipId));
  }, [availableMembers, members]);

  const addSectionMessage = !canManage
    ? "You do not have permission to add or remove involved team members for this incident."
    : availableMembers.length === 0
      ? "No active security team members are available to attach yet."
      : openOptions.length === 0
        ? "All active security team members are already attached."
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Involved team members</CardTitle>
        <CardDescription>
          Track the security team members who were actively involved in this
          incident.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No team members have been attached to this incident yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{member.name}</p>
                    <Badge variant="outline">
                      {labelForMembershipRole(member.role)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {member.email || "No email listed"}
                  </p>
                </div>
                <RemoveIncidentTeamMemberButton
                  memberId={member.id}
                  incidentId={incidentId}
                  canManage={canManage}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-1">
            <Label htmlFor={`incident-member-${incidentId}`}>Add team member</Label>
            <p className="text-sm text-muted-foreground">
              Attach additional active security team members to this incident.
            </p>
          </div>

          {addSectionMessage ? (
            <p className="text-sm text-muted-foreground">{addSectionMessage}</p>
          ) : (
            <form
              id={`incident-team-members-form-${incidentId}`}
              action={formAction}
              className="space-y-4"
            >
              {state.error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}
              {state.success && (
                <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                  Team member added.
                </p>
              )}

              <div className="space-y-2">
                <select
                  id={`incident-member-${incidentId}`}
                  name="membership_id"
                  defaultValue=""
                  className={selectClassName}
                  aria-invalid={!!state.fieldErrors?.membership_id}
                >
                  <option value="" disabled>
                    Select team member...
                  </option>
                  {openOptions.map((member) => (
                    <option key={member.membershipId} value={member.membershipId}>
                      {optionLabel(member)}
                    </option>
                  ))}
                </select>
                {state.fieldErrors?.membership_id && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.membership_id}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Add team member"}
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
