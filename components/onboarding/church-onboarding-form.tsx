"use client";

import { useActionState } from "react";
import { createChurchOnboarding } from "@/app/onboarding/church/actions";
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
import { ONBOARDING_TIMEZONES } from "@/lib/church/onboarding";
import { selectClassName } from "@/components/incidents/incident-badges";

const initialState: ActionState = {};

export function ChurchOnboardingForm({
  title = "Church details",
  description = "Create your church and primary campus. You will be assigned as the owner.",
  submitLabel = "Create church",
}: {
  title?: string;
  description?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createChurchOnboarding,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Church name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Grace Community Church"
              aria-invalid={!!state.fieldErrors?.name}
            />
            {state.fieldErrors?.name && (
              <p className="text-sm text-destructive">{state.fieldErrors.name}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primary_email">Primary email</Label>
              <Input
                id="primary_email"
                name="primary_email"
                type="email"
                placeholder="office@church.org"
                aria-invalid={!!state.fieldErrors?.primary_email}
              />
              {state.fieldErrors?.primary_email && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.primary_email}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(555) 555-5555"
                aria-invalid={!!state.fieldErrors?.phone}
              />
              {state.fieldErrors?.phone && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.phone}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address_line_1">Address</Label>
            <Input
              id="address_line_1"
              name="address_line_1"
              placeholder="123 Main Street"
              aria-invalid={!!state.fieldErrors?.address_line_1}
            />
            {state.fieldErrors?.address_line_1 && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.address_line_1}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address_line_2">Address line 2 (optional)</Label>
            <Input
              id="address_line_2"
              name="address_line_2"
              placeholder="Suite / building"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                aria-invalid={!!state.fieldErrors?.city}
              />
              {state.fieldErrors?.city && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.city}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                aria-invalid={!!state.fieldErrors?.state}
              />
              {state.fieldErrors?.state && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.state}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal code</Label>
              <Input
                id="postal_code"
                name="postal_code"
                aria-invalid={!!state.fieldErrors?.postal_code}
              />
              {state.fieldErrors?.postal_code && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.postal_code}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Time zone</Label>
            <select
              id="timezone"
              name="timezone"
              className={selectClassName}
              defaultValue="America/Los_Angeles"
              aria-invalid={!!state.fieldErrors?.timezone}
            >
              {ONBOARDING_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            {state.fieldErrors?.timezone && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.timezone}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="campus_name">Primary campus name</Label>
            <Input
              id="campus_name"
              name="campus_name"
              placeholder="Main Campus"
              aria-invalid={!!state.fieldErrors?.campus_name}
            />
            {state.fieldErrors?.campus_name && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.campus_name}
              </p>
            )}
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Creating church…" : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
