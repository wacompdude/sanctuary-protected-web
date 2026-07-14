"use client";

import {
  LabeledCheckbox,
  LabeledInput,
  LabeledTextarea,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { updateChurchSecuritySettings } from "@/app/(app)/settings/church/actions";
import type { ChurchSettingsRecord } from "@/lib/church/settings";

export function ChurchSecurityForm({
  church,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  canEdit: boolean;
}) {
  return (
    <SettingsSectionCard
      title="Security and emergency information"
      description="Operational contacts and incident defaults. Do not store alarm codes, access credentials, or other secrets here."
      action={updateChurchSecuritySettings}
      canEdit={canEdit}
    >
      {({ fieldErrors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="default_emergency_phone"
              name="default_emergency_phone"
              label="Default emergency contact number"
              type="tel"
              defaultValue={church.default_emergency_phone}
              error={fieldErrors?.default_emergency_phone}
            />
            <LabeledInput
              id="default_emergency_notification_sender"
              name="default_emergency_notification_sender"
              label="Default emergency notification sender name"
              defaultValue={church.default_emergency_notification_sender}
              error={fieldErrors?.default_emergency_notification_sender}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="police_non_emergency_phone"
              name="police_non_emergency_phone"
              label="Local police non-emergency number"
              type="tel"
              defaultValue={church.police_non_emergency_phone}
              error={fieldErrors?.police_non_emergency_phone}
            />
            <LabeledInput
              id="fire_non_emergency_phone"
              name="fire_non_emergency_phone"
              label="Local fire department non-emergency number"
              type="tel"
              defaultValue={church.fire_non_emergency_phone}
              error={fieldErrors?.fire_non_emergency_phone}
            />
          </div>
          <LabeledInput
            id="nearest_hospital_name"
            name="nearest_hospital_name"
            label="Nearest hospital name"
            defaultValue={church.nearest_hospital_name}
            error={fieldErrors?.nearest_hospital_name}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              id="nearest_hospital_phone"
              name="nearest_hospital_phone"
              label="Nearest hospital phone"
              type="tel"
              defaultValue={church.nearest_hospital_phone}
              error={fieldErrors?.nearest_hospital_phone}
            />
            <LabeledInput
              id="incident_retention_days"
              name="incident_retention_days"
              label="Default incident retention period (days)"
              type="number"
              defaultValue={church.incident_retention_days ?? 2555}
              error={fieldErrors?.incident_retention_days}
            />
          </div>
          <LabeledTextarea
            id="nearest_hospital_address"
            name="nearest_hospital_address"
            label="Nearest hospital address"
            defaultValue={church.nearest_hospital_address}
            error={fieldErrors?.nearest_hospital_address}
            rows={3}
          />
          <div className="space-y-3 rounded-md border border-border px-3 py-3">
            <LabeledCheckbox
              id="require_incident_location"
              name="require_incident_location"
              label="Require incident location"
              defaultChecked={church.require_incident_location ?? true}
            />
            <LabeledCheckbox
              id="require_incident_severity"
              name="require_incident_severity"
              label="Require incident severity"
              defaultChecked={church.require_incident_severity ?? true}
            />
            <LabeledCheckbox
              id="require_incident_follow_up"
              name="require_incident_follow_up"
              label="Require incident follow-up notes"
              defaultChecked={church.require_incident_follow_up ?? false}
            />
            <LabeledCheckbox
              id="allow_security_members_create_incidents"
              name="allow_security_members_create_incidents"
              label="Allow security members to create incidents"
              defaultChecked={
                church.allow_security_members_create_incidents ?? true
              }
            />
            <LabeledCheckbox
              id="allow_security_members_close_incidents"
              name="allow_security_members_close_incidents"
              label="Allow security members to close incidents"
              defaultChecked={
                church.allow_security_members_close_incidents ?? false
              }
            />
          </div>
        </>
      )}
    </SettingsSectionCard>
  );
}
