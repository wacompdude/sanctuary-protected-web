"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActionState } from "@/lib/church/types";
import { updateMyNotificationPreferencesAction } from "@/app/(app)/notifications/actions";

const initialState: ActionState = {};

export function NotificationPreferencesForm({
  initial,
}: {
  initial?: {
    notification_type: string;
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
    in_app_enabled: boolean;
    minimum_severity: string;
    quiet_hours_enabled: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    timezone: string;
    digest_frequency: string;
  } | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateMyNotificationPreferencesAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  const prefs = initial ?? {
    notification_type: "*",
    email_enabled: true,
    sms_enabled: false,
    push_enabled: false,
    in_app_enabled: true,
    minimum_severity: "informational",
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "06:00",
    timezone: "America/Los_Angeles",
    digest_frequency: "immediate",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Church-wide preferences</CardTitle>
        <CardDescription>
          Defaults for this church. Group rules and emergency policy can still
          change what you receive. Critical alerts may bypass quiet hours when
          your church enables that override.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Preferences updated.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notification_type">Preference scope</Label>
              <select
                id="notification_type"
                name="notification_type"
                defaultValue={prefs.notification_type}
                className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:h-9 md:min-h-0 md:text-sm"
              >
                <option value="*">All notifications</option>
                <option value="incident.created">Incident created</option>
                <option value="incident.critical">Critical incidents</option>
                <option value="certification.expiring">Certification reminders</option>
                <option value="equipment.maintenance_due">Maintenance alerts</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimum_severity">Minimum severity</Label>
              <select
                id="minimum_severity"
                name="minimum_severity"
                defaultValue={prefs.minimum_severity}
                className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:h-9 md:min-h-0 md:text-sm"
              >
                <option value="informational">Informational</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical only</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="in_app_enabled"
                defaultChecked={prefs.in_app_enabled}
                className="mt-1 h-4 w-4 rounded border border-input"
              />
              <span>Enable in-app notifications</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="email_enabled"
                defaultChecked={prefs.email_enabled}
                className="mt-1 h-4 w-4 rounded border border-input"
              />
              <span>Enable email notifications</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="sms_enabled"
                defaultChecked={prefs.sms_enabled}
                className="mt-1 h-4 w-4 rounded border border-input"
              />
              <span>
                Enable SMS notifications{" "}
                <span className="text-muted-foreground">(unavailable until configured)</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="push_enabled"
                defaultChecked={prefs.push_enabled}
                className="mt-1 h-4 w-4 rounded border border-input"
              />
              <span>
                Enable push notifications{" "}
                <span className="text-muted-foreground">(coming soon)</span>
              </span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="digest_frequency">Digest frequency</Label>
              <select
                id="digest_frequency"
                name="digest_frequency"
                defaultValue={prefs.digest_frequency}
                className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:h-9 md:min-h-0 md:text-sm"
              >
                <option value="immediate">Immediate</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="never">Never</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={prefs.timezone} />
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="quiet_hours_enabled"
                defaultChecked={prefs.quiet_hours_enabled}
                className="mt-1 h-4 w-4 rounded border border-input"
              />
              <span>Enable quiet hours for routine notifications</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quiet_hours_start">Quiet hours start</Label>
                <Input
                  id="quiet_hours_start"
                  name="quiet_hours_start"
                  type="time"
                  defaultValue={prefs.quiet_hours_start ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiet_hours_end">Quiet hours end</Label>
                <Input
                  id="quiet_hours_end"
                  name="quiet_hours_end"
                  type="time"
                  defaultValue={prefs.quiet_hours_end ?? ""}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={pending} className="h-11 w-full sm:w-auto">
            {pending ? "Saving..." : "Save preferences"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
