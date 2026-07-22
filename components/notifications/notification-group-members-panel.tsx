"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { selectClassName } from "@/components/incidents/incident-badges";
import type { ActionState } from "@/lib/church/types";
import type { NotificationGroupMember } from "@/lib/notifications/groups/types";
import { labelForMembershipRole } from "@/lib/church/invitations";

type MemberOption = {
  membershipId: string;
  name: string;
  role: string;
};

export function NotificationGroupMembersPanel({
  groupId,
  members,
  candidateMembers,
  canManage,
  isSystemGroup,
  addAction,
  addByRoleAction,
  removeAction,
}: {
  groupId: string;
  members: NotificationGroupMember[];
  candidateMembers: MemberOption[];
  canManage: boolean;
  isSystemGroup: boolean;
  addAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  addByRoleAction: (
    prev: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  removeAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [addState, addFormAction, addPending] = useActionState(addAction, {});
  const [roleState, roleFormAction, rolePending] = useActionState(
    addByRoleAction,
    {},
  );
  const [removeState, removeFormAction, removePending] = useActionState(
    removeAction,
    {},
  );

  const activeIds = new Set(members.map((member) => member.membership_id));
  const available = candidateMembers.filter(
    (member) => !activeIds.has(member.membershipId),
  );

  if (isSystemGroup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Direct members</CardTitle>
          <CardDescription>
            System groups resolve members dynamically from church roles
            {members.length > 0
              ? ` · ${members.length} active`
              : ""}
            . Manual member changes are not allowed — include this group inside
            a custom group instead of copying people.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active church members currently match this group&apos;s rule.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{member.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.role
                        ? labelForMembershipRole(member.role)
                        : "Member"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Direct members</CardTitle>
          <CardDescription>
            People individually assigned to this group
            {members.length > 0
              ? ` · ${members.length}`
              : ""}
            . Prefer including another group when you want live role membership.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {removeState.error ? (
            <p className="text-sm text-destructive">{removeState.error}</p>
          ) : null}
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No members yet. Add active church members below.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{member.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.role
                        ? labelForMembershipRole(member.role)
                        : "Member"}
                    </p>
                  </div>
                  {canManage ? (
                    <form action={removeFormAction}>
                      <input type="hidden" name="group_id" value={groupId} />
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
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Add individual members</CardTitle>
              <CardDescription>
                Select one or more active church members to assign directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={addFormAction} className="space-y-3">
                <input type="hidden" name="group_id" value={groupId} />
                {addState.error ? (
                  <p className="text-sm text-destructive">{addState.error}</p>
                ) : null}
                {addState.success ? (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Members updated.
                  </p>
                ) : null}
                {available.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    All active members are already in this group.
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

          <Card>
            <CardHeader>
              <CardTitle>Copy current role holders</CardTitle>
              <CardDescription>
                One-time copy of people who currently have the selected role.
                This does not keep them in sync — use Include existing groups
                for live nested membership.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={roleFormAction} className="space-y-3">
                <input type="hidden" name="group_id" value={groupId} />
                {roleState.error ? (
                  <p className="text-sm text-destructive">{roleState.error}</p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    name="role"
                    className={selectClassName}
                    defaultValue="security_member"
                  >
                    <option value="owner">Owner</option>
                    <option value="co_owner">Co-owner</option>
                    <option value="administrator">Administrator</option>
                    <option value="security_leader">Security leader</option>
                    <option value="security_member">Security member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <Button type="submit" disabled={rolePending} className="h-11">
                  {rolePending ? "Copying…" : "Copy role holders"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
