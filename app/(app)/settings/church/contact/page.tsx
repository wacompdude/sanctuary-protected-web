import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchAddressForm } from "@/components/settings/church-address-form";
import { ChurchContactForm } from "@/components/settings/church-contact-form";

export default function ChurchContactSettingsPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage sectionId="contact">
        {({ church, canEdit }) => (
          <>
            <ChurchContactForm church={church} canEdit={canEdit} />
            <ChurchAddressForm church={church} canEdit={canEdit} />
          </>
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
