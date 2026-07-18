"use client";

import { useActionState, useState, useTransition } from "react";
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
import {
  previewNotificationAudienceAction,
  sendComposedNotificationAction,
  type AudiencePreviewResult,
} from "@/app/(app)/notifications/composer-actions";

type GroupOption = {
  id: string;
  name: string;
  group_type: string;
  is_system_group: boolean;
  member_count: number;
};

type MemberOption = {
  membershipId: string;
  name: string;
  role: string;
};

export function NotificationComposerForm({
  groups,
  members,
  canEmergencyOverride,
  smsConfigured,
  pushConfigured,
}: {
  groups: GroupOption[];
  members: MemberOption[];
  canEmergencyOverride: boolean;
  smsConfigured: boolean;
  pushConfigured: boolean;
}) {
  const [preview, setPreview] = useState<AudiencePreviewResult["preview"] | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [sendState, sendAction, sendPending] = useActionState(
    sendComposedNotificationAction,
    {},
  );

  function handlePreview(formData: FormData) {
    startPreview(async () => {
      setPreviewError(null);
      const result = await previewNotificationAudienceAction(formData);
      if (result.error) {
        setPreview(null);
        setPreviewError(result.error);
        return;
      }
      setPreview(result.preview ?? null);
    });
  }

  return (
    <form className="space-y-6" action={sendAction}>
      {sendState.error ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {sendState.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>
            Keep email content concise. Sensitive details should stay in-app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notification_type">Notification type</Label>
              <select
                id="notification_type"
                name="notification_type"
                defaultValue="general.announcement"
                className={selectClassName}
              >
                <option value="general.announcement">Announcement</option>
                <option value="emergency.alert">Emergency alert</option>
                <option value="incident.created">Incident created</option>
                <option value="incident.critical">Critical incident</option>
                <option value="certification.expiring">
                  Certification reminder
                </option>
                <option value="equipment.maintenance_due">
                  Maintenance alert
                </option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <select
                id="severity"
                name="severity"
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Subject / title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={500}
              className="h-11"
              placeholder="Short alert title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <textarea
              id="body"
              name="body"
              required
              rows={6}
              maxLength={20000}
              className={textareaClassName}
              placeholder="What recipients need to know"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action_url">Action URL (optional)</Label>
            <Input
              id="action_url"
              name="action_url"
              className="h-11"
              placeholder="/incidents/..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
          <CardDescription>
            Select one or more notification groups. You may also add specific
            members. Contact details stay masked from this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Notification groups</p>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active groups. Create groups under Notification groups first.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {groups.map((group) => (
                  <label
                    key={group.id}
                    className="flex cursor-pointer items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="group_ids"
                      value={group.id}
                      className="mt-1"
                    />
                    <span>
                      {group.name}
                      <span className="block text-xs text-muted-foreground">
                        {group.is_system_group
                          ? "System · dynamic membership"
                          : `${group.member_count} member${group.member_count === 1 ? "" : "s"}`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Specific members (optional)</p>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {members.map((member) => (
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
                      {member.role}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery channels</CardTitle>
          <CardDescription>
            SMS and push can be selected for planning, but only in-app and email
            send today.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="channels" value="in_app" defaultChecked />
            In-app
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="channels" value="email" defaultChecked />
            Email
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="channels"
              value="sms"
              disabled={!smsConfigured}
            />
            SMS{" "}
            <span className="text-muted-foreground">
              {smsConfigured
                ? "(provider pending)"
                : "(SMS provider not configured)"}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="channels"
              value="push"
              disabled={!pushConfigured}
            />
            Push{" "}
            <span className="text-muted-foreground">
              {pushConfigured ? "(devices pending)" : "(not configured)"}
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scheduled_for">Schedule (optional)</Label>
            <Input
              id="scheduled_for"
              name="scheduled_for"
              type="datetime-local"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to send immediately.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requires_acknowledgment" />
            Require acknowledgment
          </label>
          {canEmergencyOverride ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="emergency_override" className="mt-1" />
              <span>
                Emergency override — force critical severity and allow email
                override rules where church policy permits. SMS still requires
                consent.
              </span>
            </label>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review audience</CardTitle>
          <CardDescription>
            Preview unique recipients and channel estimates before sending.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewError ? (
            <p className="text-sm text-destructive">{previewError}</p>
          ) : null}
          {preview ? (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p>
                <span className="font-medium">{preview.uniqueMembers}</span> unique
                members
              </p>
              <p>In-app deliveries: {preview.inAppDelivered}</p>
              <p>
                Email pending: {preview.emailPending}
                {preview.emailSuppressed
                  ? ` · ${preview.emailSuppressed} suppressed`
                  : ""}
              </p>
              <p className="text-muted-foreground">
                SMS suppressed (not sent): {preview.smsSuppressed} · Push
                suppressed: {preview.pushSuppressed}
              </p>
              {preview.overrideCount > 0 ? (
                <p>Emergency override paths: {preview.overrideCount}</p>
              ) : null}
              {preview.selectedGroups.length > 0 ? (
                <p>
                  Groups:{" "}
                  {preview.selectedGroups.map((group) => group.name).join(", ")}
                </p>
              ) : null}
              {preview.suppressionBreakdown.length > 0 ? (
                <div>
                  <p className="font-medium">Suppression reasons</p>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {preview.suppressionBreakdown.map((row) => (
                      <li key={row.reason}>
                        {row.reason.replaceAll("_", " ")}: {row.count}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Run a preview to estimate deliveries and exclusions.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              formAction={handlePreview}
              variant="outline"
              className="h-11"
              disabled={previewPending || sendPending}
            >
              {previewPending ? "Previewing…" : "Preview audience"}
            </Button>
            <Button type="submit" className="h-11" disabled={sendPending}>
              {sendPending ? "Sending…" : "Send notification"}
            </Button>
            <Button asChild variant="ghost" className="h-11">
              <Link href="/notifications">Cancel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
