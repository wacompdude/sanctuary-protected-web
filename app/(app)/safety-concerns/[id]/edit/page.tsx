import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SafetyConcernProfileForm } from "@/components/safety-concerns/safety-concern-profile-form";
import { SafetyConcernRestrictedBanner } from "@/components/safety-concerns/restricted-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { resolveCampusFilter } from "@/lib/campuses/filter";
import {
  getSafetyConcernAccess,
  getSafetyConcernChurchSettings,
  getSafetyConcernProfile,
  listSafetyConcernProfileCampuses,
} from "@/lib/safety-concerns";

export const metadata: Metadata = {
  title: "Edit Safety Concern Profile",
  robots: { index: false, follow: false },
};

async function EditSafetyConcernContent({ id }: { id: string }) {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const settings = await getSafetyConcernChurchSettings(church.id);
  const access = await getSafetyConcernAccess({
    organizationId: church.id,
    role: membership.role,
    allowSecurityMemberView: settings.allow_security_member_view,
  });

  if (!access.canWrite) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          {access.readOnly
            ? `${access.upgradeMessage} Editing is disabled in read-only mode.`
            : access.upgradeMessage}
        </CardContent>
      </Card>
    );
  }

  const profile = await getSafetyConcernProfile(church.id, id);
  if (!profile) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Profile not found.
        </CardContent>
      </Card>
    );
  }

  const [campusFilter, campusLinks] = await Promise.all([
    resolveCampusFilter({
      organizationId: church.id,
      userId: user.id,
      role: membership.role,
    }),
    listSafetyConcernProfileCampuses(church.id, id),
  ]);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href={`/safety-concerns/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to profile
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          Edit Safety Concern Profile
        </h1>
      </div>
      <SafetyConcernRestrictedBanner />
      <SafetyConcernProfileForm
        profile={profile}
        campuses={campusFilter.accessibleCampuses.map((campus) => ({
          id: campus.id,
          name: campus.name,
        }))}
        selectedCampusIds={campusLinks.map((link) => link.campus_id)}
      />
    </>
  );
}

async function EditSafetyConcernLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditSafetyConcernContent id={id} />;
}

export default function EditSafetyConcernPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <EditSafetyConcernLoader params={params} />
      </Suspense>
    </div>
  );
}
