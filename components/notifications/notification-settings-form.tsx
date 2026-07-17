"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import type { ActionState } from "@/lib/church/types";
import type { ChurchNotificationSettings } from "@/lib/notifications";
import {
  sendTestNotificationEmailAction,
  updateChurchNotificationSettingsAction,
} from "@/app/(app)/notifications/actions";

const initialState: ActionState = {};

export function NotificationSettingsForm({
  settings,
  canEdit,
}: {
  settings: ChurchNotificationSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateChurchNotificationSettingsAction,
    initialState,
  );
  const [testState, testAction, testPending] = useActionState(
    sendTestNotificationEmailAction,
    initialState,
  );

  useEffect(() => {
    if (state.success || testState.success) {
      router.refresh();
    }
  }, [state.success, testState.success, router]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Church notification settings</CardTitle>
          <CardDescription>
            Configure church-wide defaults for email delivery, emergency behavior,
            and summary schedules.
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
                Settings updated.
              </p>
            ) : null}
            <fieldset disabled={!canEdit || pending} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default_sender_name">Default sender name</Label>
                  <Input
                    id="default_sender_name"
                    name="default_sender_name"
                    defaultValue={settings.default_sender_name ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reply_to_email">Reply-to email</Label>
                  <Input
                    id="reply_to_email"
                    name="reply_to_email"
                    type="email"
                    defaultValue={settings.reply_to_email ?? ""}
                  />
                </div>
              </div>

              <div className="grid gap-3 rounded-md border border-border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="email_notifications_enabled"
                    defaultChecked={settings.email_notifications_enabled}
                    className="mt-1 h-4 w-4 rounded border border-input"
                  />
                  <span>Email delivery enabled</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="sms_notifications_enabled"
                    defaultChecked={settings.sms_notifications_enabled}
                    className="mt-1 h-4 w-4 rounded border border-input"
                  />
                  <span>
                    SMS enabled{" "}
                    <span className="text-muted-foreground">(provider unavailable)</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="push_notifications_enabled"
                    defaultChecked={settings.push_notifications_enabled}
                    className="mt-1 h-4 w-4 rounded border border-input"
                  />
                  <span>
                    Push enabled{" "}
                    <span className="text-muted-foreground">(coming soon)</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="critical_alert_override_enabled"
                    defaultChecked={settings.critical_alert_override_enabled}
                    className="mt-1 h-4 w-4 rounded border border-input"
                  />
                  <span>Allow critical alerts to bypass routine preferences</span>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="certification_warning_days">
                    Certification warning days
                  </Label>
                  <Input
                    id="certification_warning_days"
                    name="certification_warning_days"
                    type="number"
                    defaultValue={settings.certification_warning_days}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenance_warning_days">
                    Maintenance warning days
                  </Label>
                  <Input
                    id="maintenance_warning_days"
                    name="maintenance_warning_days"
                    type="number"
                    defaultValue={settings.maintenance_warning_days}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="daily_digest_time">Daily digest time</Label>
                  <Input
                    id="daily_digest_time"
                    name="daily_digest_time"
                    type="time"
                    defaultValue={settings.daily_digest_time}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weekly_digest_time">Weekly digest time</Label>
                  <Input
                    id="weekly_digest_time"
                    name="weekly_digest_time"
                    type="time"
                    defaultValue={settings.weekly_digest_time}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="weekly_digest_day">Weekly digest day</Label>
                  <select
                    id="weekly_digest_day"
                    name="weekly_digest_day"
                    defaultValue={String(settings.weekly_digest_day)}
                    className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:h-9 md:min-h-0 md:text-sm"
                  >
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" name="timezone" defaultValue={settings.timezone} />
                </div>
              </div>

              <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="daily_digest_enabled"
                    defaultChecked={settings.daily_digest_enabled}
                    className="mt-1 h-4 w-4 rounded border border-input"
                  />
                  <span>Enable daily digest</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="weekly_digest_enabled"
                    defaultChecked={settings.weekly_digest_enabled}
                    className="mt-1 h-4 w-4 rounded border border-input"
                  />
                  <span>Enable weekly digest</span>
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_email_attempts">Max email retry attempts</Label>
                <Input
                  id="max_email_attempts"
                  name="max_email_attempts"
                  type="number"
                  defaultValue={settings.max_email_attempts}
                />
              </div>
            </fieldset>

            {canEdit ? (
              <Button type="submit" disabled={pending} className="h-11 w-full sm:w-auto">
                {pending ? "Saving..." : "Save settings"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                View-only access. Owners and administrators can edit settings.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test email</CardTitle>
          <CardDescription>
            Sends a test notification to your verified account email using the same
            adapter and delivery pipeline as production notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={testAction} className="space-y-3">
            {testState.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {testState.error}
              </p>
            ) : null}
            {testState.success ? (
              <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                Test notification queued.
              </p>
            ) : null}
            <Button
              type="submit"
              variant="outline"
              disabled={!canEdit || testPending}
              className="h-11 w-full sm:w-auto"
            >
              {testPending ? "Sending..." : "Send test email"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
