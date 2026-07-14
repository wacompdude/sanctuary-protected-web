import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchPreferencesForm } from "@/components/settings/church-preferences-form";

export default function ChurchPreferencesSettingsPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage sectionId="preferences">
        {({ church, canEdit }) => (
          <ChurchPreferencesForm
            church={church}
            preferences={church.preferences}
            canEdit={canEdit}
          />
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
