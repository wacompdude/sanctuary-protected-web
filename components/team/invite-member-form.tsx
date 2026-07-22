"use client";

import { useActionState } from "react";
import { createChurchInvitation } from "@/app/(app)/team/invite-actions";
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
  INVITE_EXPIRATION_OPTIONS,
  labelForMembershipRole,
  type InvitableRole,
  type InviteActionState,
} from "@/lib/church/invitations";

const initialState: InviteActionState = {};

export function InviteMemberForm({
  allowedRoles,
}: {
  allowedRoles: InvitableRole[];
}) {
  const [state, formAction, pending] = useActionState(
    createChurchInvitation,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitation details</CardTitle>
        <CardDescription>
          We&apos;ll email a secure invitation link from Sanctuary Protected
          Access. Only the invitee&apos;s email can accept it. Replies go to
          support@sanctuaryprotected.com.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          {state.success && (
            <div className="space-y-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-3 text-sm">
              {state.emailSent ? (
                <p className="font-medium text-green-800 dark:text-green-300">
                  Invitation email sent.
                </p>
              ) : (
                <>
                  <p className="font-medium text-green-800 dark:text-green-300">
                    Invitation created, but the email could not be sent.
                  </p>
                  {state.emailError ? (
                    <p className="text-muted-foreground">{state.emailError}</p>
                  ) : null}
                  {state.invitationUrl ? (
                    <>
                      <p className="text-muted-foreground">
                        Copy and share this link instead:
                      </p>
                      <Input
                        readOnly
                        value={state.invitationUrl}
                        className="font-mono text-xs"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </>
                  ) : null}
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="member@example.com"
              required
              aria-invalid={!!state.fieldErrors?.email}
            />
            {state.fieldErrors?.email && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              name="role"
              required
              defaultValue={allowedRoles[0] ?? "viewer"}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-invalid={!!state.fieldErrors?.role}
            >
              {allowedRoles.map((role) => (
                <option key={role} value={role}>
                  {labelForMembershipRole(role)}
                </option>
              ))}
            </select>
            {state.fieldErrors?.role && (
              <p className="text-sm text-destructive">{state.fieldErrors.role}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires_in_days">Expiration period</Label>
            <select
              id="expires_in_days"
              name="expires_in_days"
              required
              defaultValue="14"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-invalid={!!state.fieldErrors?.expires_in_days}
            >
              {INVITE_EXPIRATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {state.fieldErrors?.expires_in_days && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.expires_in_days}
              </p>
            )}
          </div>

          <Button type="submit" disabled={pending || allowedRoles.length === 0}>
            {pending ? "Sending invitation…" : "Send invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
