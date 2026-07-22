"use client";

import Link from "next/link";
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
import type { NotificationGroupNestingSummary } from "@/lib/notifications/groups/types";
import {
  labelForGroupStatus,
  labelForGroupType,
} from "@/lib/notifications/groups/constants";

export type NestableGroupOption = {
  id: string;
  name: string;
  groupType: string;
  isSystemGroup: boolean;
  disabledReason: string | null;
};

export function NotificationGroupIncludedPanel({
  groupId,
  included,
  candidateGroups,
  canManage,
  addAction,
  removeAction,
}: {
  groupId: string;
  included: NotificationGroupNestingSummary[];
  candidateGroups: NestableGroupOption[];
  canManage: boolean;
  addAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  removeAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [addState, addFormAction, addPending] = useActionState(addAction, {});
  const [removeState, removeFormAction, removePending] = useActionState(
    removeAction,
    {},
  );

  const available = candidateGroups.filter((group) => !group.disabledReason);
  const blocked = candidateGroups.filter((group) => group.disabledReason);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Included groups</CardTitle>
          <CardDescription>
            Nested groups stay linked by reference. Their members are resolved
            dynamically and are not copied into this group.
            {included.length > 0
              ? ` · ${included.length} included`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {removeState.error ? (
            <p className="text-sm text-destructive">{removeState.error}</p>
          ) : null}
          {included.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups included yet. Add system or custom groups below.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {included.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div>
                    {row.child_group ? (
                      <Link
                        href={`/notification-groups/${row.child_group.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {row.child_group.name}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">Unknown group</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {row.child_group
                        ? `${labelForGroupType(row.child_group.group_type)} · ${labelForGroupStatus(row.child_group.status)}${row.child_group.is_system_group ? " · System" : ""}`
                        : "Nested group"}
                    </p>
                  </div>
                  {canManage ? (
                    <form action={removeFormAction}>
                      <input type="hidden" name="group_id" value={groupId} />
                      <input type="hidden" name="nesting_id" value={row.id} />
                      <input
                        type="hidden"
                        name="child_group_id"
                        value={row.child_group_id}
                      />
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
        <Card>
          <CardHeader>
            <CardTitle>Include existing groups</CardTitle>
            <CardDescription>
              Select a system or custom group to nest. Members of that group
              become effective members here automatically.
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
                  Group included.
                </p>
              ) : null}
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other groups are available to include
                  {blocked.length > 0
                    ? " (remaining choices would create a cycle or are already included)"
                    : ""}
                  .
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="child_group_id">Group</Label>
                  <select
                    id="child_group_id"
                    name="child_group_id"
                    className={selectClassName}
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select a group…
                    </option>
                    {available.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                        {group.isSystemGroup ? " (system)" : ""} ·{" "}
                        {labelForGroupType(group.groupType)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                type="submit"
                disabled={addPending || available.length === 0}
                className="h-11"
              >
                {addPending ? "Including…" : "Include group"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
