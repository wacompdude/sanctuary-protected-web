"use client";

import {
  LabeledInput,
  LabeledSelect,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { updateChurchAddressSettings } from "@/app/(app)/settings/church/actions";
import {
  SETTINGS_TIMEZONES,
  type ChurchSettingsRecord,
} from "@/lib/church/settings";

const TIMEZONE_OPTIONS = SETTINGS_TIMEZONES.map((tz) => ({
  value: tz,
  label: tz.replace(/_/g, " "),
}));

export function ChurchAddressForm({
  church,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  canEdit: boolean;
}) {
  const timezone = church.timezone || "America/Los_Angeles";
  const timezoneOptions =
    TIMEZONE_OPTIONS.some((option) => option.value === timezone)
      ? TIMEZONE_OPTIONS
      : [{ value: timezone, label: timezone }, ...TIMEZONE_OPTIONS];

  return (
    <SettingsSectionCard
      title="Address and time zone"
      description="Physical location and local time used across the application."
      action={updateChurchAddressSettings}
      canEdit={canEdit}
    >
      {({ fieldErrors }) => (
        <>
          <LabeledInput
            id="address_line_1"
            name="address_line_1"
            label="Address line 1"
            defaultValue={church.address_line_1}
            error={fieldErrors?.address_line_1}
          />
          <LabeledInput
            id="address_line_2"
            name="address_line_2"
            label="Address line 2"
            defaultValue={church.address_line_2}
            error={fieldErrors?.address_line_2}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="city"
              name="city"
              label="City"
              defaultValue={church.city}
              error={fieldErrors?.city}
            />
            <LabeledInput
              id="state"
              name="state"
              label="State or province"
              defaultValue={church.state}
              error={fieldErrors?.state}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="postal_code"
              name="postal_code"
              label="Postal code"
              defaultValue={church.postal_code}
              error={fieldErrors?.postal_code}
            />
            <LabeledInput
              id="country"
              name="country"
              label="Country"
              defaultValue={church.country ?? "United States"}
              error={fieldErrors?.country}
            />
          </div>
          <LabeledSelect
            id="timezone"
            name="timezone"
            label="Time zone"
            defaultValue={timezone}
            error={fieldErrors?.timezone}
            options={timezoneOptions}
          />
        </>
      )}
    </SettingsSectionCard>
  );
}
