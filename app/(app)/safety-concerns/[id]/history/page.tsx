import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SafetyConcernRestrictedBanner } from "@/components/safety-concerns/restricted-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import {
  canReadSafetyConcernAudit,
  getSafetyConcernAccess,
  getSafetyConcernChurchSettings,
  getSafetyConcernProfile,
  listSafetyConcernReviews,
} from "@/lib/safety-concerns";

export const metadata: Metadata = {
  title: "Safety Concern History",
  robots: { index: false, follow: false },
};

async function HistoryContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const settings = await getSafetyConcernChurchSettings(church.id);
  const access = await getSafetyConcernAccess({
    churchId: church.id,
    role: membership.role,
    allowSecurityMemberView: settings.allow_security_member_view,
  });

  if (!access.canRead || !canReadSafetyConcernAudit(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Review history is limited to security leadership.
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

  const reviews = await listSafetyConcernReviews(church.id, id);

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
          Review history · {profile.display_name}
        </h1>
      </div>
      <SafetyConcernRestrictedBanner />
      <Card>
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
          <CardDescription>
            Periodic confirmation of continued need and accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews recorded.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-md border px-3 py-3 text-sm">
                  <p className="font-medium capitalize">
                    {review.outcome.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(review.reviewed_at).toLocaleString()}
                    {review.new_next_review_date
                      ? ` · Next review ${review.new_next_review_date}`
                      : ""}
                  </p>
                  {review.notes ? (
                    <p className="mt-2 text-muted-foreground whitespace-pre-wrap">
                      {review.notes}
                    </p>
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

async function HistoryLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HistoryContent id={id} />;
}

export default function SafetyConcernHistoryPage({
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
        <HistoryLoader params={params} />
      </Suspense>
    </div>
  );
}
