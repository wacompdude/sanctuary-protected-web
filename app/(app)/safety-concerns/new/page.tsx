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
} from "@/lib/safety-concerns";

export const metadata: Metadata = {
  title: "New Safety Concern Profile",
  robots: { index: false, follow: false },
};

async function NewSafetyConcernContent() {
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
            ? `${access.upgradeMessage} Creation is disabled in read-only mode.`
            : access.upgradeMessage}
        </CardContent>
      </Card>
    );
  }

  const campusFilter = await resolveCampusFilter({
    organizationId: church.id,
    userId: user.id,
    role: membership.role,
  });

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/safety-concerns">
            <ArrowLeft className="h-4 w-4" />
            Back to profiles
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          New Safety Concern Profile
        </h1>
      </div>
      <SafetyConcernRestrictedBanner />
      <SafetyConcernProfileForm
        campuses={campusFilter.accessibleCampuses.map((campus) => ({
          id: campus.id,
          name: campus.name,
        }))}
      />
    </>
  );
}

export default function NewSafetyConcernPage() {
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
        <NewSafetyConcernContent />
      </Suspense>
    </div>
  );
}
