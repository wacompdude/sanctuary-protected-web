"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addCampusMembersAction,
  removeCampusMemberAction,
  setMemberPrimaryCampusAction,
  updateCampusMemberRoleAction,
} from "@/app/(app)/campuses/membership-actions";
import { selectClassName } from "@/components/incidents/incident-badges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CAMPUS_ROLES, labelForCampusRole } from "@/lib/campuses/constants";
import type { CampusActionState, CampusMembership } from "@/lib/campuses/types";
import { labelForMembershipRole } from "@/lib/church/invitations";

type MemberOption = {
  membershipId: string;
  name: string;
  role: string;
};

const initialState: CampusActionState = {};

export function CampusMembersPanel({
  campusId,
  members,
  candidateMembers,
  canManage,
  hasImplicitAccessNote,
}: {
  campusId: string;
  members: CampusMembership[];
  candidateMembers: MemberOption[];
  canManage: boolean;
  hasImplicitAccessNote?: boolean;
}) {
  const router = useRouter();
  const [addState, addAction, addPending] = useActionState(
    addCampusMembersAction,
    initialState,
  );
  const [roleState, roleAction, rolePending] = useActionState(
    updateCampusMemberRoleAction,
    initialState,
  );
  const [primaryState, primaryAction, primaryPending] = useActionState(
    setMemberPrimaryCampusAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeCampusMemberAction,
    initialState,
  );

  useEffect(() => {
    if (
      addState.success ||
      roleState.success ||
      primaryState.success ||
      removeState.success
    ) {
      router.refresh();
    }
  }, [
    addState.success,
    roleState.success,
    primaryState.success,
    removeState.success,
    router,
  ]);

  const activeIds = new Set(members.map((member) => member.church_membership_id));
  const available = candidateMembers.filter(
    (member) => !activeIds.has(member.membershipId),
  );

  return (
    <div className="space-y-4">
      {hasImplicitAccessNote ? (
        <Card>
          <CardHeader>
            <CardTitle>Implicit all-campus access</CardTitle>
            <CardDescription>
              Owners, co-owners, administrators, and security leaders can access
              every campus without an explicit campus membership. Assignments
              below are still useful for staffing and filtering.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Campus members</CardTitle>
          <CardDescription>
            {members.length} active assignment
            {members.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {removeState.error || roleState.error || primaryState.error ? (
            <p className="text-sm text-destructive" role="alert">
              {removeState.error || roleState.error || primaryState.error}
            </p>
          ) : null}
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campus memberships yet. Add active church members below.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {member.display_name ?? "Member"}
                      {member.is_primary_campus ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          Primary for member
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {labelForCampusRole(member.campus_role)}
                      {member.church_role
                        ? ` · Church: ${labelForMembershipRole(member.church_role)}`
                        : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={roleAction} className="flex items-center gap-2">
                        <input type="hidden" name="campus_id" value={campusId} />
                        <input type="hidden" name="member_id" value={member.id} />
                        <select
                          name="campus_role"
                          defaultValue={member.campus_role}
                          className={selectClassName}
                          aria-label={`Role for ${member.display_name}`}
                        >
                          {CAMPUS_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="h-10"
                          disabled={rolePending}
                        >
                          Update
                        </Button>
                      </form>
                      {!member.is_primary_campus ? (
                        <form action={primaryAction}>
                          <input type="hidden" name="campus_id" value={campusId} />
                          <input type="hidden" name="member_id" value={member.id} />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            className="h-10"
                            disabled={primaryPending}
                          >
                            Set primary
                          </Button>
                        </form>
                      ) : null}
                      <form action={removeAction}>
                        <input type="hidden" name="campus_id" value={campusId} />
                        <input type="hidden" name="member_id" value={member.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="h-10"
                          disabled={removePending}
                        >
                          Remove
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add members</CardTitle>
            <CardDescription>
              Members may belong to multiple campuses. Removing a campus
              assignment does not remove church membership.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addAction} className="space-y-3">
              <input type="hidden" name="campus_id" value={campusId} />
              {addState.error ? (
                <p className="text-sm text-destructive" role="alert">
                  {addState.error}
                </p>
              ) : null}
              {addState.success ? (
                <p className="text-sm text-green-700 dark:text-green-400">
                  Members updated.
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="campus_role">Campus role</Label>
                <select
                  id="campus_role"
                  name="campus_role"
                  className={selectClassName}
                  defaultValue=""
                >
                  <option value="">Default from church role</option>
                  {CAMPUS_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_primary_campus"
                  value="true"
                  className="mt-1 h-4 w-4 rounded border border-input"
                />
                <span>
                  <span className="font-medium">
                    Set as primary campus for selected members
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Otherwise the first campus assignment becomes primary.
                  </span>
                </span>
              </label>

              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All active church members are already assigned to this campus.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                  {available.map((member) => (
                    <label
                      key={member.membershipId}
                      className="flex cursor-pointer items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="membership_ids"
                        value={member.membershipId}
                        className="mt-1"
                      />
                      <span>
                        {member.name}
                        <span className="block text-xs text-muted-foreground">
                          {labelForMembershipRole(member.role)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <Button
                type="submit"
                disabled={addPending || available.length === 0}
                className="h-11"
              >
                {addPending ? "Adding…" : "Add selected"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
