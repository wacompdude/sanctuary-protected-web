import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchSecurityForm } from "@/components/settings/church-security-form";

export default function ChurchSecuritySettingsPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage sectionId="security">
        {({ church, canEdit }) => (
          <ChurchSecurityForm church={church} canEdit={canEdit} />
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
