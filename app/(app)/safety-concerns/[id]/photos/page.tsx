import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SafetyConcernPhotoForm } from "@/components/safety-concerns/safety-concern-photo-form";
import { SafetyConcernRestrictedBanner } from "@/components/safety-concerns/restricted-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import {
  getSafetyConcernAccess,
  getSafetyConcernChurchSettings,
  getSafetyConcernProfile,
  listSafetyConcernPhotos,
} from "@/lib/safety-concerns";
import { archiveSafetyConcernPhoto } from "@/app/(app)/safety-concerns/actions";

export const metadata: Metadata = {
  title: "Safety Concern Photos",
  robots: { index: false, follow: false },
};

async function PhotosContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const settings = await getSafetyConcernChurchSettings(church.id);
  const access = await getSafetyConcernAccess({
    organizationId: church.id,
    role: membership.role,
    allowSecurityMemberView: settings.allow_security_member_view,
  });
  if (!access.canRead) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          {access.upgradeMessage}
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

  const photos = await listSafetyConcernPhotos(church.id, id, {
    withSignedUrls: true,
  });

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
          Photos · {profile.display_name}
        </h1>
      </div>
      <SafetyConcernRestrictedBanner />
      {access.canWrite ? (
        <SafetyConcernPhotoForm
          profileId={id}
          maxCount={access.maxPhotosPerProfile}
          maxSizeMb={access.maxPhotoSizeMb}
          currentCount={photos.length}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>All photos</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo) => (
                <li key={photo.id} className="space-y-2 rounded-md border p-3">
                  {photo.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.signed_url}
                      alt="Profile photo for restricted Safety Concern Profile"
                      className="aspect-square w-full rounded object-cover"
                    />
                  ) : null}
                  {access.canWrite ? (
                    <form
                      action={archiveSafetyConcernPhoto.bind(
                        null,
                        id,
                        photo.id,
                      )}
                    >
                      <Button type="submit" size="sm" variant="outline">
                        Archive photo
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function PhotosLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PhotosContent id={id} />;
}

export default function SafetyConcernPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <PhotosLoader params={params} />
      </Suspense>
    </div>
  );
}
