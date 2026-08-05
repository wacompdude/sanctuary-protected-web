import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SafetyConcernArchiveForm } from "@/components/safety-concerns/safety-concern-archive-form";
import { SafetyConcernIncidentLinkForm } from "@/components/safety-concerns/safety-concern-incident-link-form";
import { SafetyConcernPhotoForm } from "@/components/safety-concerns/safety-concern-photo-form";
import { SafetyConcernReviewForm } from "@/components/safety-concerns/safety-concern-review-form";
import { SafetyConcernRestrictedBanner } from "@/components/safety-concerns/restricted-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { listIncidentsForChurch } from "@/lib/incidents/queries";
import {
  getSafetyConcernAccess,
  getSafetyConcernChurchSettings,
  getSafetyConcernProfileDetail,
  labelForSafetyConcernEnum,
  SAFETY_CONCERN_INCIDENT_RELATIONSHIPS,
  SAFETY_CONCERN_PROFILE_STATUSES,
  SAFETY_CONCERN_RESTRICTION_STATUSES,
  SAFETY_CONCERN_RESTRICTION_TYPES,
  SAFETY_CONCERN_RISK_CONTEXTS,
} from "@/lib/safety-concerns";
import { archiveSafetyConcernPhoto, restoreSafetyConcernProfile, unlinkSafetyConcernIncident } from "@/app/(app)/safety-concerns/actions";

export const metadata: Metadata = {
  title: "Safety Concern Profile",
  robots: { index: false, follow: false },
};

async function ProfileDetailContent({ id }: { id: string }) {
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

  const detail = await getSafetyConcernProfileDetail(church.id, id, {
    withSignedUrls: true,
  });
  if (!detail) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Profile not found or not available for your campus access.
        </CardContent>
      </Card>
    );
  }

  const { profile, photos, campuses, incidents, reviews } = detail;
  const canManage = access.canWrite;
  const primary = photos.find((photo) => photo.is_primary) ?? photos[0] ?? null;

  const allIncidents = canManage
    ? await listIncidentsForChurch(church.id).catch(() => [])
    : [];
  const linkedIds = new Set(incidents.map((link) => link.incident_id));
  const linkable = allIncidents
    .filter((incident) => !linkedIds.has(incident.id))
    .slice(0, 50)
    .map((incident) => ({ id: incident.id, title: incident.title }));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
            <Link href="/safety-concerns">
              <ArrowLeft className="h-4 w-4" />
              Back to profiles
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            {profile.display_name}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {labelForSafetyConcernEnum(
              SAFETY_CONCERN_PROFILE_STATUSES,
              profile.profile_status,
            )}
            {" · "}
            {labelForSafetyConcernEnum(
              SAFETY_CONCERN_RISK_CONTEXTS,
              profile.risk_context,
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/safety-concerns/${id}/history`}>History</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href={`/safety-concerns/${id}/photos`}>Photos</Link>
          </Button>
          {canManage ? (
            <Button asChild className="h-11">
              <Link href={`/safety-concerns/${id}/edit`}>Edit</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <SafetyConcernRestrictedBanner />

      {access.readOnly ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Read-only mode — editing and uploads are disabled on your current plan.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardContent className="pt-6">
            {primary?.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primary.signed_url}
                alt="Profile photo for restricted Safety Concern Profile"
                className="aspect-[4/5] w-full rounded-md border object-cover"
              />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No photo
              </div>
            )}
            {primary?.photo_context_note ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {primary.photo_context_note}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>
                Concise operational information for authorized personnel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {profile.known_aliases ? (
                <p>
                  <span className="text-muted-foreground">Aliases: </span>
                  {profile.known_aliases}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Restriction: </span>
                {labelForSafetyConcernEnum(
                  SAFETY_CONCERN_RESTRICTION_TYPES,
                  profile.restriction_type,
                )}{" "}
                (
                {labelForSafetyConcernEnum(
                  SAFETY_CONCERN_RESTRICTION_STATUSES,
                  profile.restriction_status,
                )}
                )
              </p>
              {profile.restriction_end_date ? (
                <p>
                  <span className="text-muted-foreground">Restriction ends: </span>
                  {profile.restriction_end_date}
                </p>
              ) : null}
              {profile.short_note ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2">
                  {profile.short_note}
                </p>
              ) : null}
              {profile.response_guidance ? (
                <div>
                  <p className="font-medium">Response guidance</p>
                  <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                    {profile.response_guidance}
                  </p>
                </div>
              ) : null}
              <p>
                <span className="text-muted-foreground">Campuses: </span>
                {profile.scope_type === "church_wide"
                  ? "Church-wide"
                  : campuses.length > 0
                    ? `${campuses.length} assigned`
                    : "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Last reviewed: </span>
                {profile.last_reviewed_at
                  ? new Date(profile.last_reviewed_at).toLocaleString()
                  : "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Next review: </span>
                {profile.next_review_date ?? "—"}
              </p>
            </CardContent>
          </Card>

          {profile.general_notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Detailed notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {profile.general_notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SafetyConcernPhotoForm
            profileId={id}
            maxCount={access.maxPhotosPerProfile}
            maxSizeMb={access.maxPhotoSizeMb}
            currentCount={photos.length}
          />
          <SafetyConcernReviewForm profileId={id} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>
            {photos.length} photo{photos.length === 1 ? "" : "s"} on file.
          </CardDescription>
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
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                      Unavailable
                    </div>
                  )}
                  {photo.photo_context_note ? (
                    <p className="text-xs text-muted-foreground">
                      {photo.photo_context_note}
                    </p>
                  ) : null}
                  {canManage ? (
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Related incidents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked incidents.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {incidents.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div>
                      <Link
                        href={`/incidents/${link.incident_id}`}
                        className="font-medium hover:underline"
                      >
                        View incident
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {labelForSafetyConcernEnum(
                          SAFETY_CONCERN_INCIDENT_RELATIONSHIPS,
                          link.relationship_type,
                        )}
                      </p>
                    </div>
                    {canManage ? (
                      <form
                        action={unlinkSafetyConcernIncident.bind(
                          null,
                          id,
                          link.id,
                        )}
                      >
                        <Button type="submit" size="sm" variant="ghost">
                          Unlink
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {canManage ? (
          <SafetyConcernIncidentLinkForm
            profileId={id}
            incidents={linkable}
          />
        ) : null}
      </div>

      {canManage && profile.profile_status !== "archived" ? (
        <Card>
          <CardHeader>
            <CardTitle>Archive</CardTitle>
            <CardDescription>
              Archived profiles remain protected and are hidden from active browse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SafetyConcernArchiveForm profileId={id} />
          </CardContent>
        </Card>
      ) : null}

      {canManage && profile.profile_status === "archived" ? (
        <Card>
          <CardHeader>
            <CardTitle>Restore</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={restoreSafetyConcernProfile.bind(null, id)}>
              <Button type="submit" variant="outline">
                Restore to under review
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {canManage && reviews.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {reviews.slice(0, 5).map((review) => (
                <li key={review.id} className="rounded-md border px-3 py-2">
                  <p className="font-medium capitalize">
                    {review.outcome.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(review.reviewed_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

async function ProfileDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProfileDetailContent id={id} />;
}

export default function SafetyConcernDetailPage({
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
              Loading profile…
            </CardContent>
          </Card>
        }
      >
        <ProfileDetailLoader params={params} />
      </Suspense>
    </div>
  );
}
