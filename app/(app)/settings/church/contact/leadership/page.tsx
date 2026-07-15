import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchDirectoryGroupLoader } from "@/components/settings/church-directory-group-loader";
import { CHURCH_CONTACT_GROUPS } from "@/lib/church/contacts";

const group = CHURCH_CONTACT_GROUPS.find((item) => item.id === "leadership")!;

export default function ChurchContactLeadershipPage() {
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
          />
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
