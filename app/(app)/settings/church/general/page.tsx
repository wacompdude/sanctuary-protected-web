import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchGeneralForm } from "@/components/settings/church-general-form";

export default function ChurchGeneralSettingsPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage sectionId="general">
        {({ church, canEdit }) => (
          <ChurchGeneralForm church={church} canEdit={canEdit} />
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
