"use client";

import {
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { updateChurchGeneralSettings } from "@/app/(app)/settings/church/actions";
import {
  SETTINGS_TIMEZONES,
  type ChurchSettingsRecord,
} from "@/lib/church/settings";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "other", label: "Other" },
] as const;

const TIMEZONE_OPTIONS = SETTINGS_TIMEZONES.map((tz) => ({
  value: tz,
  label: tz.replace(/_/g, " "),
}));

export function ChurchGeneralForm({
  church,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  canEdit: boolean;
}) {
  const timezone = church.timezone || "America/Los_Angeles";
  const timezoneOptions = TIMEZONE_OPTIONS.some(
    (option) => option.value === timezone,
  )
    ? TIMEZONE_OPTIONS
    : [{ value: timezone, label: timezone }, ...TIMEZONE_OPTIONS];

  return (
    <SettingsSectionCard
      title="General information"
      description="Identity, public profile, and the time zone used for dates across the app."
      action={updateChurchGeneralSettings}
      canEdit={canEdit}
    >
      {({ fieldErrors }) => (
        <>
          <LabeledInput
            id="name"
            name="name"
            label="Church name"
            defaultValue={church.name}
            error={fieldErrors?.name}
          />
          <LabeledInput
            id="display_name"
            name="display_name"
            label="Public display name"
            defaultValue={church.display_name}
            error={fieldErrors?.display_name}
            hint="Optional. Shown when a shorter or public-facing name is preferred."
          />
          <LabeledInput
            id="slug"
            name="slug"
            label="Church slug"
            defaultValue={church.slug}
            error={fieldErrors?.slug}
            hint="Changing the slug may affect future public URLs. Use lowercase letters, numbers, and hyphens."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="denomination"
              name="denomination"
              label="Denomination or affiliation"
              defaultValue={church.denomination}
              error={fieldErrors?.denomination}
            />
            <LabeledInput
              id="year_established"
              name="year_established"
              label="Year established"
              type="number"
              defaultValue={church.year_established}
              error={fieldErrors?.year_established}
            />
          </div>
          <LabeledSelect
            id="primary_language"
            name="primary_language"
            label="Primary language"
            defaultValue={church.primary_language ?? "en"}
            error={fieldErrors?.primary_language}
            options={LANGUAGE_OPTIONS}
          />
          <LabeledSelect
            id="timezone"
            name="timezone"
            label="Time zone"
            defaultValue={timezone}
            error={fieldErrors?.timezone}
            options={timezoneOptions}
            hint="All timestamps in the app (dashboard, incidents, notifications, and more) use this time zone."
          />
          <LabeledTextarea
            id="description"
            name="description"
            label="Church description"
            defaultValue={church.description}
            error={fieldErrors?.description}
          />
        </>
      )}
    </SettingsSectionCard>
  );
}
