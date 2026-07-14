import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchBrandingForm } from "@/components/settings/church-branding-form";

export default function ChurchBrandingSettingsPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage sectionId="branding">
        {({ church, canEdit }) => (
          <ChurchBrandingForm church={church} canEdit={canEdit} />
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
