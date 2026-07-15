import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchDirectoryGroupLoader } from "@/components/settings/church-directory-group-loader";
import { CHURCH_CONTACT_GROUPS } from "@/lib/church/contacts";

const group = CHURCH_CONTACT_GROUPS.find(
  (item) => item.id === "security-emergency",
)!;

export default function ChurchContactSecurityEmergencyPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage
        sectionId="contact"
        heading={group.label}
        description={`${group.description} Settings for your active church.`}
      >
        {({ church, canEdit }) => (
          <ChurchDirectoryGroupLoader
            churchId={church.id}
            canEdit={canEdit}
            contactTypes={[...group.contactTypes]}
            intro="These are directory contacts for partners and leads. Incident policy numbers (hospital, fire, retention) remain under Security and Emergency Information."
          />
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
