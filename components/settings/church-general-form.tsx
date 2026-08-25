"use client";

import { useState } from "react";
import {
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { TimeZoneSelector } from "@/components/ui/timezone-select";
import { SlugField } from "@/components/ui/slug-field";
import { updateChurchGeneralSettings } from "@/app/(app)/settings/church/actions";
import type { ChurchSettingsRecord } from "@/lib/organization/settings";
import { WEEK_STARTS_ON_OPTIONS } from "@/lib/organization/threat-levels";
import { SLUG_HELP, TIMEZONE_HELP } from "@/lib/organization/field-help";
import {
  slugAfterNameChange,
  slugifyOrganizationName,
  type OrganizationSlugMode,
} from "@/lib/organization/slug";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "other", label: "Other" },
] as const;

export function ChurchGeneralForm({
  church,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  canEdit: boolean;
}) {
  const timezone = church.timezone || "America/Los_Angeles";
  const [name, setName] = useState(church.name);
  const [slug, setSlug] = useState(church.slug);
  const [slugMode, setSlugMode] = useState<OrganizationSlugMode>("manual");

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
            value={name}
            onChange={(value) => {
              setName(value);
              setSlug(slugAfterNameChange(slugMode, value, slug));
            }}
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
          <SlugField
            id="slug"
            name="slug"
            help={SLUG_HELP}
            value={slug}
            onChange={(value) => {
              setSlugMode("manual");
              setSlug(value);
            }}
            error={fieldErrors?.slug}
            showGenerate={slugMode === "manual"}
            onGenerate={() => {
              setSlugMode("auto");
              setSlug(slugifyOrganizationName(name));
            }}
            generateLabel="Generate from church name"
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
          <TimeZoneSelector
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            error={fieldErrors?.timezone}
            help={TIMEZONE_HELP}
            hint="All timestamps in the app (dashboard, incidents, notifications, and more) use this time zone."
          />
          <LabeledSelect
            id="week_starts_on"
            name="week_starts_on"
            label="Week starts on"
            defaultValue={String(church.week_starts_on ?? 0)}
            error={fieldErrors?.week_starts_on}
            options={WEEK_STARTS_ON_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            hint="Used for weekly threat levels and other week-based views. Default is Sunday–Saturday. Change for traditions that begin the week on another day."
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
