"use client";

import { useActionState, useMemo, useState } from "react";
import { assignMemberToShiftAction } from "@/app/(app)/schedule/shift-actions";
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
import { SCHEDULE_ASSIGNMENT_ROLES } from "@/lib/schedule/constants";
import type {
  EligibleMemberOption,
  ScheduleActionState,
} from "@/lib/schedule/types";

const initialState: ScheduleActionState = {};

export function AssignMemberForm({
  shiftId,
  members,
  canOverride,
}: {
  shiftId: string;
  members: EligibleMemberOption[];
  canOverride: boolean;
}) {
  const action = assignMemberToShiftAction.bind(null, shiftId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [override, setOverride] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      if (!q) return true;
      return (
        member.name.toLowerCase().includes(q) ||
        (member.email ?? "").toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q)
      );
    });
  }, [members, query]);

  const selectedMember = members.find((m) => m.membershipId === selected);
  const conflicts = state.conflicts ?? [
    ...(selectedMember?.blockers ?? []),
    ...(selectedMember?.warnings ?? []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign member</CardTitle>
        <CardDescription>
          Eligible active members with conflict checks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              Assignment created.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="member_search">Search</Label>
            <Input
              id="member_search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, email, or role"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="membership_id">Member</Label>
            <select
              id="membership_id"
              name="membership_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a member</option>
              {filtered.map((member) => (
                <option key={member.membershipId} value={member.membershipId}>
                  {member.name}
                  {member.blockers.length
                    ? ` — ${member.blockers.length} conflict(s)`
                    : member.warnings.length
                      ? ` — ${member.warnings.length} warning(s)`
                      : " — available"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment_role">Assignment role</Label>
            <select
              id="assignment_role"
              name="assignment_role"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue="security_member"
            >
              {SCHEDULE_ASSIGNMENT_ROLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" maxLength={2000} />
          </div>

          {conflicts.length > 0 ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Conflicts</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {conflicts.map((conflict, index) => (
                  <li key={`${conflict.conflict_type}-${index}`}>
                    <span className="font-medium text-foreground">
                      {conflict.severity === "blocker" ? "Blocked: " : "Warning: "}
                    </span>
                    {conflict.message}
                    <span className="sr-only">
                      {" "}
                      Conflict type {conflict.conflict_type}
                    </span>
                  </li>
                ))}
              </ul>
              {canOverride &&
              conflicts.some(
                (c) => c.severity === "blocker" && c.override_allowed,
              ) ? (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <input
                      id="conflict_override"
                      name="conflict_override"
                      type="checkbox"
                      className="h-4 w-4 rounded border"
                      checked={override}
                      onChange={(e) => setOverride(e.target.checked)}
                    />
                    <Label htmlFor="conflict_override">
                      Override conflicts (authorized)
                    </Label>
                  </div>
                  {override ? (
                    <div className="space-y-2">
                      <Label htmlFor="conflict_override_reason">
                        Override reason
                      </Label>
                      <textarea
                        id="conflict_override_reason"
                        name="conflict_override_reason"
                        required
                        minLength={3}
                        rows={2}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" disabled={pending || !selected}>
            {pending ? "Assigning…" : "Assign member"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
