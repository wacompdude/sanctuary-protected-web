import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchAddressForm } from "@/components/settings/church-address-form";
import { ChurchContactForm } from "@/components/settings/church-contact-form";
import { CHURCH_CONTACT_GROUPS } from "@/lib/church/contacts";

const group = CHURCH_CONTACT_GROUPS.find((item) => item.id === "organization")!;

export default function ChurchContactOrganizationPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage
        sectionId="contact"
        heading={group.label}
        description={`${group.description} Settings for your active church.`}
      >
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
