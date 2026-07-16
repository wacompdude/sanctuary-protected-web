"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { TeamMemberRow } from "@/lib/church/team";
import { labelForMembershipRole } from "@/lib/church/invitations";

function optionLabel(member: TeamMemberRow) {
  const secondary = member.email ? ` (${member.email})` : "";
  return `${member.name}${secondary} - ${labelForMembershipRole(member.role)}`;
}

export function IncidentTeamMembersFields({
  members,
}: {
  members: TeamMemberRow[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (members.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        No active security team members are available to attach yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium">Involved team members</p>
        <p className="text-xs text-muted-foreground">
          Optional. Select every active security team member who was actively
          involved in this incident.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Team members</Label>
        <div className="space-y-2 rounded-md border border-border p-3">
          {members.map((member) => {
            const checkboxId = `incident-member-${member.membershipId}`;
            const checked = selectedIds.includes(member.membershipId);

            return (
              <label
                key={member.membershipId}
                htmlFor={checkboxId}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-2 hover:bg-muted/40"
              >
                <Checkbox
                  id={checkboxId}
                  name="incident_member_ids"
                  value={member.membershipId}
                  checked={checked}
                  onCheckedChange={(nextChecked) => {
                    setSelectedIds((current) =>
                      nextChecked
                        ? [...current, member.membershipId]
                        : current.filter((id) => id !== member.membershipId),
                    );
                  }}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {optionLabel(member)}
                  </p>
                </div>
              </label>
            );
          })}
          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedIds.length} team member
              {selectedIds.length === 1 ? "" : "s"} selected.
            </p>
          )}
          {selectedIds.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Leave all unchecked if no team members were involved.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
