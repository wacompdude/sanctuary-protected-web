"use client";

import {
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { updateChurchGeneralSettings } from "@/app/(app)/settings/church/actions";
import type { ChurchSettingsRecord } from "@/lib/church/settings";

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
  return (
    <SettingsSectionCard
      title="General information"
      description="Identity and public profile details for this church."
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
