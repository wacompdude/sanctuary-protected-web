import {
  ChurchSettingsSectionPage,
  ChurchSettingsSectionSuspense,
} from "@/components/settings/church-settings-section";
import { ChurchAccountCard } from "@/components/settings/church-account-card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ChurchAccountSettingsPage() {
  return (
    <ChurchSettingsSectionSuspense>
      <ChurchSettingsSectionPage sectionId="account">
        {({ church, isOwner }) => (
          <>
            <ChurchAccountCard church={church} isOwner={isOwner} />
            {isOwner ? (
              <Button variant="outline" asChild>
                <Link href="/settings/church/danger">Open Danger Zone</Link>
              </Button>
            ) : null}
          </>
        )}
      </ChurchSettingsSectionPage>
    </ChurchSettingsSectionSuspense>
  );
}
