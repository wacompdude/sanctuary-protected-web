"use client";

import { useActionState } from "react";
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
import { selectClassName } from "@/components/incidents/incident-badges";
import type { ActionState } from "@/lib/church/types";
import type { NotificationGroupDefault } from "@/lib/notifications/groups/types";

export function NotificationGroupDefaultsForm({
  groupId,
  defaults,
  canManage,
  action,
}: {
  groupId: string;
  defaults: NotificationGroupDefault[];
  canManage: boolean;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group defaults</CardTitle>
        <CardDescription>
          Default delivery behavior for this group. Member preferences can still
          override routine messages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {defaults.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {defaults.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-border px-3 py-2"
              >
                <p className="font-medium">{row.notification_type}</p>
                <p className="text-xs text-muted-foreground">
                  Email {row.email_enabled ? "on" : "off"} · SMS{" "}
                  {row.sms_enabled ? "on" : "off"} · Push{" "}
                  {row.push_enabled ? "on" : "off"} · In-app{" "}
                  {row.in_app_enabled ? "on" : "off"} · Min severity{" "}
                  {row.minimum_severity}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No custom defaults yet. Church settings apply until you save one.
          </p>
        )}

        {canManage ? (
          <form action={formAction} className="space-y-3 border-t border-border pt-4">
            <input type="hidden" name="group_id" value={groupId} />
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            {state.success ? (
              <p className="text-sm text-green-700 dark:text-green-400">
                Defaults saved.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="notification_type">Notification type</Label>
              <Input
                id="notification_type"
                name="notification_type"
                defaultValue="*"
                className="h-11"
                placeholder="* or incident.critical"
              />
              <p className="text-xs text-muted-foreground">
                Use * for all types, or a specific type key.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimum_severity">Minimum severity</Label>
              <select
                id="minimum_severity"
                name="minimum_severity"
                defaultValue="informational"
                className={selectClassName}
              >
                <option value="informational">Informational</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="email_enabled" defaultChecked />
                Email enabled
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="sms_enabled" />
                SMS enabled (stored; delivery not active yet)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="push_enabled" />
                Push enabled (stored; delivery not active yet)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="in_app_enabled" defaultChecked />
                In-app enabled
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="require_acknowledgment" />
                Require acknowledgment
              </label>
            </div>
            <Button type="submit" disabled={pending} className="h-11">
              {pending ? "Saving…" : "Save defaults"}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
