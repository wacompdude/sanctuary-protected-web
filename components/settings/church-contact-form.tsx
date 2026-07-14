"use client";

import {
  LabeledInput,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { updateChurchContactSettings } from "@/app/(app)/settings/church/actions";
import type { ChurchSettingsRecord } from "@/lib/church/settings";

export function ChurchContactForm({
  church,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  canEdit: boolean;
}) {
  return (
    <SettingsSectionCard
      title="Contact information"
      description="How people and partner agencies can reach your church."
      action={updateChurchContactSettings}
      canEdit={canEdit}
    >
      {({ fieldErrors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="primary_email"
              name="primary_email"
              label="Primary email"
              type="email"
              defaultValue={church.primary_email}
              error={fieldErrors?.primary_email}
            />
            <LabeledInput
              id="phone"
              name="phone"
              label="Main phone number"
              type="tel"
              defaultValue={church.phone}
              error={fieldErrors?.phone}
            />
          </div>
          <LabeledInput
            id="website_url"
            name="website_url"
            label="Website URL"
            type="url"
            placeholder="https://"
            defaultValue={church.website_url}
            error={fieldErrors?.website_url}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="emergency_contact_name"
              name="emergency_contact_name"
              label="Emergency contact name"
              defaultValue={church.emergency_contact_name}
              error={fieldErrors?.emergency_contact_name}
            />
            <LabeledInput
              id="emergency_contact_phone"
              name="emergency_contact_phone"
              label="Emergency contact phone"
              type="tel"
              defaultValue={church.emergency_contact_phone}
              error={fieldErrors?.emergency_contact_phone}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="secondary_emergency_contact_name"
              name="secondary_emergency_contact_name"
              label="Secondary emergency contact name"
              defaultValue={church.secondary_emergency_contact_name}
              error={fieldErrors?.secondary_emergency_contact_name}
            />
            <LabeledInput
              id="secondary_emergency_contact_phone"
              name="secondary_emergency_contact_phone"
              label="Secondary emergency contact phone"
              type="tel"
              defaultValue={church.secondary_emergency_contact_phone}
              error={fieldErrors?.secondary_emergency_contact_phone}
            />
          </div>
        </>
      )}
    </SettingsSectionCard>
  );
}
