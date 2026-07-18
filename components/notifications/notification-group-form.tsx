"use client";

import { useActionState } from "react";
import Link from "next/link";
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
  selectClassName,
  textareaClassName,
} from "@/components/incidents/incident-badges";
import type { ActionState } from "@/lib/church/types";
import {
  NOTIFICATION_GROUP_STATUSES,
  NOTIFICATION_GROUP_TYPES,
} from "@/lib/notifications/groups/constants";
import type { NotificationGroup } from "@/lib/notifications/groups/types";

export function NotificationGroupForm({
  action,
  group,
  campuses,
  canEdit,
  mode,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  group?: NotificationGroup;
  campuses: Array<{ id: string; name: string }>;
  canEdit: boolean;
  mode: "create" | "edit";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSystem = Boolean(group?.is_system_group);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "create" ? "New notification group" : "Edit group"}
        </CardTitle>
        <CardDescription>
          {isSystem
            ? "System groups are role-based. Membership is automatic."
            : "Church-managed recipient groups for operational alerts."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          {group ? (
            <input type="hidden" name="group_id" value={group.id} />
          ) : null}
          {state.error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Saved successfully.
            </p>
          ) : null}

          <fieldset disabled={!canEdit || pending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                defaultValue={group?.name ?? ""}
                readOnly={isSystem}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={2000}
                defaultValue={group?.description ?? ""}
                className={textareaClassName}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="group_type">Type</Label>
                <select
                  id="group_type"
                  name="group_type"
                  defaultValue={group?.group_type ?? "custom"}
                  disabled={isSystem}
                  className={selectClassName}
                >
                  {NOTIFICATION_GROUP_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {mode === "edit" ? (
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={group?.status ?? "active"}
                    className={selectClassName}
                  >
                    {NOTIFICATION_GROUP_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="campus_id">Campus (optional)</Label>
                <select
                  id="campus_id"
                  name="campus_id"
                  defaultValue={group?.campus_id ?? ""}
                  className={selectClassName}
                >
                  <option value="">All campuses</option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_notification_severity">
                  Default severity
                </Label>
                <select
                  id="default_notification_severity"
                  name="default_notification_severity"
                  defaultValue={
                    group?.default_notification_severity ?? "informational"
                  }
                  className={selectClassName}
                >
                  <option value="informational">Informational</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {!isSystem ? (
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="allow_member_self_join"
                    defaultChecked={group?.allow_member_self_join}
                  />
                  Allow members to join themselves
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="allow_member_self_leave"
                    defaultChecked={group?.allow_member_self_leave}
                  />
                  Allow members to leave themselves
                </label>
              </div>
            ) : null}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button type="submit" disabled={pending} className="h-11">
                {pending
                  ? "Saving…"
                  : mode === "create"
                    ? "Create group"
                    : "Save changes"}
              </Button>
            ) : null}
            <Button asChild variant="outline" className="h-11">
              <Link
                href={
                  group
                    ? `/notification-groups/${group.id}`
                    : "/notification-groups"
                }
              >
                Cancel
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
