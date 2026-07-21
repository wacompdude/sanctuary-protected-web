"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  LabeledCheckbox,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
} from "@/components/settings/settings-form-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CAMPUS_STATUSES,
  CAMPUS_STATUSES_LEGACY,
  CAMPUS_TYPES,
} from "@/lib/campuses/constants";
import type { Campus, CampusActionState } from "@/lib/campuses/types";
import { SETTINGS_TIMEZONES } from "@/lib/church/settings";

const TIMEZONE_OPTIONS = SETTINGS_TIMEZONES.map((tz) => ({
  value: tz,
  label: tz.replace(/_/g, " "),
}));

const initialState: CampusActionState = {};

export function CampusForm({
  action,
  campus,
  canEdit,
  mode,
  extendedSchema = true,
  defaultTimezone,
}: {
  action: (
    prev: CampusActionState,
    formData: FormData,
  ) => Promise<CampusActionState>;
  campus?: Campus;
  canEdit: boolean;
  mode: "create" | "edit";
  extendedSchema?: boolean;
  defaultTimezone?: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success && mode === "edit") {
      router.refresh();
    }
  }, [state.success, mode, router]);

  const timezone =
    campus?.timezone || defaultTimezone || "America/Los_Angeles";
  const timezoneOptions = TIMEZONE_OPTIONS.some(
    (option) => option.value === timezone,
  )
    ? TIMEZONE_OPTIONS
    : [{ value: timezone, label: timezone }, ...TIMEZONE_OPTIONS];

  const statusOptions = extendedSchema
    ? CAMPUS_STATUSES
    : CAMPUS_STATUSES_LEGACY;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state.success && mode === "edit" ? (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Campus saved.
        </p>
      ) : null}

      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "create" ? "New campus" : "Campus details"}
            </CardTitle>
            <CardDescription>
              Identity and operational classification for this location.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="name"
              name="name"
              label="Name"
              defaultValue={campus?.name}
              error={state.fieldErrors?.name}
            />
            {extendedSchema ? (
              <>
                <LabeledInput
                  id="short_name"
                  name="short_name"
                  label="Short name"
                  defaultValue={campus?.short_name}
                  error={state.fieldErrors?.short_name}
                  hint="Optional display abbreviation."
                />
                <LabeledInput
                  id="slug"
                  name="slug"
                  label="Slug"
                  defaultValue={campus?.slug}
                  error={state.fieldErrors?.slug}
                  hint="Lowercase letters, numbers, and hyphens. Auto-generated if blank."
                />
                <LabeledSelect
                  id="campus_type"
                  name="campus_type"
                  label="Type"
                  defaultValue={campus?.campus_type ?? "satellite"}
                  options={CAMPUS_TYPES}
                  error={state.fieldErrors?.campus_type}
                />
              </>
            ) : null}
            <LabeledSelect
              id="status"
              name="status"
              label="Status"
              defaultValue={campus?.status ?? "active"}
              options={statusOptions}
              error={state.fieldErrors?.status}
            />
            <LabeledSelect
              id="timezone"
              name="timezone"
              label="Timezone"
              defaultValue={timezone}
              options={timezoneOptions}
              error={state.fieldErrors?.timezone}
            />
            {extendedSchema ? (
              <div className="sm:col-span-2">
                <LabeledCheckbox
                  id="is_primary"
                  name="is_primary"
                  label="Primary campus"
                  defaultChecked={campus?.is_primary}
                  hint="Each church must have exactly one primary campus."
                />
                {state.fieldErrors?.is_primary ? (
                  <p className="mt-1 text-sm text-destructive">
                    {state.fieldErrors.is_primary}
                  </p>
                ) : null}
              </div>
            ) : null}
            {extendedSchema ? (
              <div className="sm:col-span-2">
                <LabeledTextarea
                  id="description"
                  name="description"
                  label="Description"
                  defaultValue={campus?.description}
                  error={state.fieldErrors?.description}
                  rows={3}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address & contact</CardTitle>
            <CardDescription>
              Location and primary contact details.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="address_line_1"
              name="address_line_1"
              label="Address line 1"
              defaultValue={campus?.address_line_1}
              error={state.fieldErrors?.address_line_1}
            />
            <LabeledInput
              id="address_line_2"
              name="address_line_2"
              label="Address line 2"
              defaultValue={campus?.address_line_2}
              error={state.fieldErrors?.address_line_2}
            />
            <LabeledInput
              id="city"
              name="city"
              label="City"
              defaultValue={campus?.city}
              error={state.fieldErrors?.city}
            />
            <LabeledInput
              id="state"
              name="state"
              label="State / province"
              defaultValue={campus?.state}
              error={state.fieldErrors?.state}
            />
            <LabeledInput
              id="postal_code"
              name="postal_code"
              label="Postal code"
              defaultValue={campus?.postal_code}
              error={state.fieldErrors?.postal_code}
            />
            {extendedSchema ? (
              <>
                <LabeledInput
                  id="country"
                  name="country"
                  label="Country"
                  defaultValue={campus?.country ?? "US"}
                  error={state.fieldErrors?.country}
                />
                <LabeledInput
                  id="primary_email"
                  name="primary_email"
                  label="Primary email"
                  type="email"
                  defaultValue={campus?.primary_email}
                  error={state.fieldErrors?.primary_email}
                />
                <LabeledInput
                  id="phone"
                  name="phone"
                  label="Phone"
                  defaultValue={campus?.phone}
                  error={state.fieldErrors?.phone}
                />
              </>
            ) : null}
          </CardContent>
        </Card>

        {extendedSchema ? (
          <Card>
            <CardHeader>
              <CardTitle>Emergency contacts</CardTitle>
              <CardDescription>
                Local emergency and hospital information for this campus.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <LabeledInput
                id="emergency_contact_name"
                name="emergency_contact_name"
                label="Emergency contact name"
                defaultValue={campus?.emergency_contact_name}
              />
              <LabeledInput
                id="emergency_contact_phone"
                name="emergency_contact_phone"
                label="Emergency contact phone"
                defaultValue={campus?.emergency_contact_phone}
              />
              <LabeledInput
                id="police_non_emergency_phone"
                name="police_non_emergency_phone"
                label="Police (non-emergency)"
                defaultValue={campus?.police_non_emergency_phone}
              />
              <LabeledInput
                id="fire_non_emergency_phone"
                name="fire_non_emergency_phone"
                label="Fire (non-emergency)"
                defaultValue={campus?.fire_non_emergency_phone}
              />
              <LabeledInput
                id="nearest_hospital_name"
                name="nearest_hospital_name"
                label="Nearest hospital"
                defaultValue={campus?.nearest_hospital_name}
              />
              <LabeledInput
                id="nearest_hospital_phone"
                name="nearest_hospital_phone"
                label="Hospital phone"
                defaultValue={campus?.nearest_hospital_phone}
              />
              <div className="sm:col-span-2">
                <LabeledInput
                  id="nearest_hospital_address"
                  name="nearest_hospital_address"
                  label="Hospital address"
                  defaultValue={campus?.nearest_hospital_address}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button type="submit" disabled={pending} className="h-11">
            {pending
              ? "Saving…"
              : mode === "create"
                ? "Create campus"
                : "Save changes"}
          </Button>
        ) : null}
        <Button asChild variant="outline" className="h-11">
          <Link href={campus ? `/campuses/${campus.id}` : "/campuses"}>
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
