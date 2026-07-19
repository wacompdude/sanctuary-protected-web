"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addPolicyAssignment,
  revokePolicyAssignment,
} from "@/app/(app)/policies/acknowledgment-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { labelForMembershipRole } from "@/lib/church/invitations";
import { POLICY_MINIMUM_ROLES } from "@/lib/policies/constants";
import type { PolicyAssignment } from "@/lib/policies/types";
import type { ActionState } from "@/lib/church/types";

const initialState: ActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function assignmentLabel(assignment: PolicyAssignment): string {
  switch (assignment.assignment_type) {
    case "all_members":
      return "All members";
    case "security_team":
      return "Security team";
    case "role":
      return `Role: ${labelForMembershipRole(String(assignment.role ?? ""))}`;
    case "user":
      return `User: ${assignment.user_display_name ?? "Member"}`;
    case "campus":
      return `Campus: ${assignment.campus_name ?? "Selected campus"}`;
    default:
      return assignment.assignment_type;
  }
}

export function PolicyAssignmentsEditor({
  policyId,
  assignments,
  members,
  campuses,
  audienceIsCustom,
}: {
  policyId: string;
  assignments: PolicyAssignment[];
  members: { userId: string; displayName: string; role: string }[];
  campuses: { id: string; name: string }[];
  audienceIsCustom: boolean;
}) {
  const bound = addPolicyAssignment.bind(null, policyId);
  const [state, formAction, pending] = useActionState(bound, initialState);
  const [assignmentType, setAssignmentType] = useState("role");
  const [revokePending, startRevoke] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom audience assignments</CardTitle>
        <CardDescription>
          {audienceIsCustom
            ? "These assignments control who can view and who receives acknowledgments."
            : "Set audience to “Custom assignment” on the policy form to use these targets."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{assignmentLabel(assignment)}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={revokePending}
                  onClick={() => {
                    startRevoke(async () => {
                      await revokePolicyAssignment(assignment.id);
                    });
                  }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form action={formAction} className="space-y-3 rounded-md border border-dashed border-border p-4">
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-green-700 dark:text-green-400">
              Assignment added.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="assignment_type">Assignment type</Label>
            <select
              id="assignment_type"
              name="assignment_type"
              className={selectClassName}
              value={assignmentType}
              onChange={(event) => setAssignmentType(event.target.value)}
            >
              <option value="all_members">All members</option>
              <option value="security_team">Security team</option>
              <option value="role">Role</option>
              <option value="user">Specific user</option>
              <option value="campus">Campus</option>
            </select>
          </div>
          {assignmentType === "role" ? (
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                className={selectClassName}
                defaultValue="security_member"
              >
                {POLICY_MINIMUM_ROLES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {assignmentType === "user" ? (
            <div className="space-y-2">
              <Label htmlFor="user_id">Member</Label>
              <select id="user_id" name="user_id" className={selectClassName}>
                <option value="">Select member</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} ({labelForMembershipRole(member.role)})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {assignmentType === "campus" ? (
            <div className="space-y-2">
              <Label htmlFor="campus_id">Campus</Label>
              <select
                id="campus_id"
                name="campus_id"
                className={selectClassName}
              >
                <option value="">Select campus</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add assignment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
