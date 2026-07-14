import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchDangerZone } from "@/components/settings/church-danger-zone";

export default function ChurchDangerSettingsPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage sectionId="danger">
        {({ church, isOwner }) => (
          <ChurchDangerZone church={church} isOwner={isOwner} />
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
