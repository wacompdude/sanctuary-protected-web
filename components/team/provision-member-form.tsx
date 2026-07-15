"use client";

import { useActionState, useState } from "react";
import { provisionChurchMember } from "@/app/(app)/team/provision-actions";
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
  labelForMembershipRole,
  type InvitableRole,
} from "@/lib/church/invitations";
import {
  MIN_PASSWORD_LENGTH,
  type ProvisionMemberActionState,
} from "@/lib/church/provision-member";

const initialState: ProvisionMemberActionState = {};

export function ProvisionMemberForm({
  allowedRoles,
}: {
  allowedRoles: InvitableRole[];
}) {
  const [state, formAction, pending] = useActionState(
    provisionChurchMember,
    initialState,
  );
  const [passwordMode, setPasswordMode] = useState<"generate" | "manual">(
    "generate",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Member details</CardTitle>
        <CardDescription>
          Create a login for someone and grant them church access with a security
          role. Share the credentials securely — they are shown only once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          {state.success && state.credentials && (
            <div className="space-y-3 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-3 text-sm">
              <p className="font-medium text-green-800 dark:text-green-300">
                {state.credentials.accountCreated
                  ? "Member created"
                  : state.credentials.passwordReset
                    ? "Member added and password reset"
                    : "Member added"}
                . Copy these credentials now.
              </p>
              <div className="space-y-2">
                <Label htmlFor="credential_email">Email / username</Label>
                <Input
                  id="credential_email"
                  readOnly
                  value={state.credentials.email}
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="credential_password">Temporary password</Label>
                <Input
                  id="credential_password"
                  readOnly
                  value={state.credentials.password}
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
              <p className="text-muted-foreground">
                They can sign in at the login page immediately. Ask them to change
                their password after first login.
              </p>
            </div>
          )}

          {state.success && !state.credentials && (
            <div className="space-y-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-3 text-sm">
              <p className="font-medium text-green-800 dark:text-green-300">
                Member added with church access.
              </p>
              <p className="text-muted-foreground">
                This email already had a Sanctuary login. Their existing password
                still works — check “Reset password…” next time if you need to
                issue new credentials.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                name="first_name"
                autoComplete="given-name"
                required
                aria-invalid={!!state.fieldErrors?.first_name}
              />
              {state.fieldErrors?.first_name && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.first_name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                name="last_name"
                autoComplete="family-name"
                required
                aria-invalid={!!state.fieldErrors?.last_name}
              />
              {state.fieldErrors?.last_name && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.last_name}
                </p>
              )}
            </div>
          </div>

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
              <p className="text-sm text-destructive">{state.fieldErrors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Security role</Label>
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
            <p className="text-xs text-muted-foreground">
              Role controls which areas of the app they can open (Team,
              Certifications, Settings, Audit, and so on).
            </p>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Login password</p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="password_mode"
                  value="generate"
                  checked={passwordMode === "generate"}
                  onChange={() => setPasswordMode("generate")}
                />
                Generate a temporary password
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="password_mode"
                  value="manual"
                  checked={passwordMode === "manual"}
                  onChange={() => setPasswordMode("manual")}
                />
                Set password myself
              </label>
            </div>
            {passwordMode === "manual" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="text"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                  aria-invalid={!!state.fieldErrors?.password}
                />
                {state.fieldErrors?.password && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.password}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              </div>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="reset_existing_password"
                value="on"
                className="mt-1"
              />
              <span>
                If this email already has a Sanctuary login, reset their password
                to the one above so you can share new credentials.
              </span>
            </label>
          </div>

          <Button type="submit" disabled={pending || allowedRoles.length === 0}>
            {pending ? "Adding member…" : "Add member with login"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
