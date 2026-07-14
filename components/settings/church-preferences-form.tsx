"use client";

import {
  LabeledCheckbox,
  LabeledInput,
  LabeledSelect,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { updateChurchPreferenceSettings } from "@/app/(app)/settings/church/actions";
import {
  DATE_FORMAT_OPTIONS,
  DASHBOARD_LANDING_OPTIONS,
  INCIDENT_SORT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  type ChurchAppPreferences,
  type ChurchSettingsRecord,
} from "@/lib/church/settings";

export function ChurchPreferencesForm({
  church,
  preferences,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  preferences: ChurchAppPreferences;
  canEdit: boolean;
}) {
  return (
    <SettingsSectionCard
      title="Application preferences"
      description="Defaults for dates, landing pages, and feature toggles. Push, SMS, IoT, and camera options are placeholders until those products ship."
      action={updateChurchPreferenceSettings}
      canEdit={canEdit}
    >
      {({ fieldErrors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledSelect
              id="date_format"
              name="date_format"
              label="Date format"
              defaultValue={preferences.date_format}
              error={fieldErrors?.date_format}
              options={DATE_FORMAT_OPTIONS}
            />
            <LabeledSelect
              id="time_format"
              name="time_format"
              label="Time format"
              defaultValue={preferences.time_format}
              error={fieldErrors?.time_format}
              options={TIME_FORMAT_OPTIONS}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledSelect
              id="default_dashboard_page"
              name="default_dashboard_page"
              label="Default dashboard landing page"
              defaultValue={preferences.default_dashboard_page}
              error={fieldErrors?.default_dashboard_page}
              options={DASHBOARD_LANDING_OPTIONS}
            />
            <LabeledSelect
              id="default_incident_sort"
              name="default_incident_sort"
              label="Default incident list sort order"
              defaultValue={preferences.default_incident_sort}
              error={fieldErrors?.default_incident_sort}
              options={INCIDENT_SORT_OPTIONS}
            />
          </div>
          <LabeledInput
            id="certification_warning_days"
            name="certification_warning_days"
            label="Certification expiration warning period (days)"
            type="number"
            defaultValue={church.certification_warning_days ?? 60}
            error={fieldErrors?.certification_warning_days}
          />
          <div className="space-y-3 rounded-md border border-border px-3 py-3">
            <LabeledCheckbox
              id="enable_email_notifications"
              name="enable_email_notifications"
              label="Enable email notifications"
              defaultChecked={preferences.enable_email_notifications}
            />
            <LabeledCheckbox
              id="enable_push_notifications"
              name="enable_push_notifications"
              label="Enable push notifications (stored only)"
              defaultChecked={preferences.enable_push_notifications}
              hint="Saved for future use. Push delivery is not active yet."
            />
            <LabeledCheckbox
              id="enable_sms_notifications"
              name="enable_sms_notifications"
              label="Enable SMS notifications (stored only)"
              defaultChecked={preferences.enable_sms_notifications}
              hint="Saved for future use. SMS delivery is not active yet."
            />
            <LabeledCheckbox
              id="enable_iot_sensors"
              name="enable_iot_sensors"
              label="Enable IoT sensor features (stored only)"
              defaultChecked={preferences.enable_iot_sensors}
              hint="Saved for future use. Sensor integrations are not active yet."
            />
            <LabeledCheckbox
              id="enable_camera_integration"
              name="enable_camera_integration"
              label="Enable camera integration features (stored only)"
              defaultChecked={preferences.enable_camera_integration}
              hint="Saved for future use. Camera integrations are not active yet."
            />
          </div>
        </>
      )}
    </SettingsSectionCard>
  );
}
