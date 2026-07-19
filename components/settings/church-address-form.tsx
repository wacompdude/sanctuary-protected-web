"use client";

import {
  LabeledInput,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { updateChurchAddressSettings } from "@/app/(app)/settings/church/actions";
import type { ChurchSettingsRecord } from "@/lib/church/settings";

export function ChurchAddressForm({
  church,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  canEdit: boolean;
}) {
  return (
    <SettingsSectionCard
      title="Address"
      description="Physical location for this church."
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
        </>
      )}
    </SettingsSectionCard>
  );
}
