"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import type {
  PreferableGroup,
  PreferenceRule,
} from "@/lib/notifications/preference-rules/queries";
import { upsertGroupPreferenceRuleAction } from "@/app/(app)/notifications/preference-actions";

export function NotificationGroupPreferencesForm({
  groups,
  rules,
}: {
  groups: PreferableGroup[];
  rules: PreferenceRule[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    upsertGroupPreferenceRuleAction,
    {},
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group preferences</CardTitle>
        <CardDescription>
          Override delivery for groups you belong to. More specific rules win
          over church-wide preferences. SMS/push toggles are stored only until
          those channels are configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rules.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {rules
              .filter((rule) => rule.group_id)
              .map((rule) => (
                <li
                  key={rule.id}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <p className="font-medium">
                    {rule.group_name ?? "Group"} · {rule.channel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Type {rule.notification_type} ·{" "}
                    {rule.enabled ? "enabled" : "disabled"} · min{" "}
                    {rule.minimum_severity}
                  </p>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No group-specific rules yet.
          </p>
        )}

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not in any notification groups yet.
          </p>
        ) : (
          <form action={formAction} className="space-y-3 border-t border-border pt-4">
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            {state.success ? (
              <p className="text-sm text-green-700 dark:text-green-400">
                Group preference saved.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="group_id">Group</Label>
                <select
                  id="group_id"
                  name="group_id"
                  required
                  className={selectClassName}
                  defaultValue={groups[0]?.id}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                      {group.is_system_group ? " (system)" : ""}
                      {group.source === "inherited" ? " (via nested group)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">Channel</Label>
                <select
                  id="channel"
                  name="channel"
                  defaultValue="email"
                  className={selectClassName}
                >
                  <option value="email">Email</option>
                  <option value="in_app">In-app</option>
                  <option value="sms">SMS (stored only)</option>
                  <option value="push">Push (stored only)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notification_type">Notification type</Label>
                <select
                  id="notification_type"
                  name="notification_type"
                  defaultValue="*"
                  className={selectClassName}
                >
                  <option value="*">All types</option>
                  <option value="incident.created">Incident created</option>
                  <option value="incident.critical">Critical incidents</option>
                  <option value="certification.expiring">
                    Certification reminders
                  </option>
                </select>
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
                  <option value="critical">Critical only</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked />
              Enable this channel for the selected group
            </label>

            <Button type="submit" disabled={pending} className="h-11">
              {pending ? "Saving…" : "Save group preference"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
