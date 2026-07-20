"use client";

import { useActionState, useState, useTransition } from "react";
import {
  previewScheduleAudienceAction,
  sendScheduleCustomNotificationAction,
  type ScheduleAudiencePreview,
} from "@/app/(app)/schedule/notification-actions";
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
import type { ScheduleActionState } from "@/lib/schedule/types";

type GroupOption = { id: string; name: string; member_count?: number };
type MemberOption = { membershipId: string; name: string; role: string };
type ShiftOption = { id: string; title: string };
type EventOption = { id: string; title: string };

const initialState: ScheduleActionState = {};

export function ScheduleNotificationComposer({
  groups,
  members,
  shifts,
  events,
}: {
  groups: GroupOption[];
  members: MemberOption[];
  shifts: ShiftOption[];
  events: EventOption[];
}) {
  const [preview, setPreview] = useState<
    ScheduleAudiencePreview["preview"] | null
  >(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [sendLater, setSendLater] = useState(false);
  const [state, formAction, pending] = useActionState(
    sendScheduleCustomNotificationAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Schedule notification created. Email deliveries go through the
          existing dispatch pipeline and respect member preferences.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>
            Do not include alarm codes, passwords, or other secrets.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" required maxLength={200} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="message">Message</Label>
            <textarea
              id="message"
              name="message"
              required
              maxLength={4000}
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <select
              id="severity"
              name="severity"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue="medium"
            >
              <option value="informational">Informational</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="action_url">Action URL (optional)</Label>
            <Input
              id="action_url"
              name="action_url"
              placeholder="/schedule/calendar"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event_id">Related event</Label>
            <select
              id="event_id"
              name="event_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="">None</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift_id">Related shift</Label>
            <select
              id="shift_id"
              name="shift_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="">None</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.title}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="requires_acknowledgment"
              className="h-4 w-4 rounded border"
            />
            Require acknowledgment
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Notification groups</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No groups.</p>
              ) : (
                groups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="group_ids"
                      value={group.id}
                      className="h-4 w-4 rounded border"
                    />
                    {group.name}
                    {typeof group.member_count === "number"
                      ? ` (${group.member_count})`
                      : ""}
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Individual members</Label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {members.map((member) => (
                <label
                  key={member.membershipId}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="membership_ids"
                    value={member.membershipId}
                    className="h-4 w-4 rounded border"
                  />
                  {member.name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              name="include_assigned_shift"
              className="h-4 w-4 rounded border"
            />
            Also include members assigned to the selected shift
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels & timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="channels"
                value="in_app"
                defaultChecked
                className="h-4 w-4 rounded border"
              />
              In-app
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="channels"
                value="email"
                defaultChecked
                className="h-4 w-4 rounded border"
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
              <input type="checkbox" disabled className="h-4 w-4 rounded border" />
              SMS (future)
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
              <input type="checkbox" disabled className="h-4 w-4 rounded border" />
              Push (future)
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="send_later"
              className="h-4 w-4 rounded border"
              checked={sendLater}
              onChange={(e) => setSendLater(e.target.checked)}
            />
            Schedule for later
          </label>
          {sendLater ? (
            <div className="space-y-2 max-w-sm">
              <Label htmlFor="scheduled_for">Send at</Label>
              <Input
                id="scheduled_for"
                name="scheduled_for"
                type="datetime-local"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review</CardTitle>
          <CardDescription>
            Preview unique recipients before sending. Duplicates across groups
            are removed automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {previewError ? (
            <p className="text-sm text-destructive">{previewError}</p>
          ) : null}
          {preview ? (
            <ul className="text-sm text-muted-foreground">
              <li>Unique members: {preview.uniqueMembers}</li>
              <li>Email deliveries pending: {preview.emailPending}</li>
              <li>Email suppressed: {preview.emailSuppressed}</li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No preview yet.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={previewPending}
              onClick={() => {
                const form = document.querySelector("form");
                if (!(form instanceof HTMLFormElement)) return;
                const formData = new FormData(form);
                startPreview(async () => {
                  setPreviewError(null);
                  const result = await previewScheduleAudienceAction(formData);
                  if (result.error) {
                    setPreview(null);
                    setPreviewError(result.error);
                    return;
                  }
                  setPreview(result.preview ?? null);
                });
              }}
            >
              {previewPending ? "Previewing…" : "Preview audience"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : sendLater ? "Schedule message" : "Send now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
