import { Suspense } from "react";
import Link from "next/link";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { ProfileAvatarForm } from "@/components/profile/profile-avatar-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOwnProfile } from "@/lib/profile/queries";
import {
  listOwnCertifications,
  listOwnChurchMemberships,
} from "@/lib/profile/memberships";
import { listOwnCampusMemberships } from "@/lib/campuses/membership-queries";
import { labelForCampusRole } from "@/lib/campuses/constants";
import { labelForMembershipRole } from "@/lib/church/invitations";
import { labelForMembershipStatus } from "@/lib/church/team";
import { formatChurchDate } from "@/lib/datetime/format";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeftRight } from "lucide-react";

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "expiring_soon":
    case "suspended":
      return "secondary";
    case "expired":
    case "removed":
      return "destructive";
    default:
      return "outline";
  }
}

async function ProfileContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You must be signed in to view your profile.
        </CardContent>
      </Card>
    );
  }

  const profile = await getOwnProfile();

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Your profile is still being created. Refresh in a moment, or contact
          support if this persists.
        </CardContent>
      </Card>
    );
  }

  const [memberships, certifications, campusMemberships] = await Promise.all([
    listOwnChurchMemberships(),
    listOwnCertifications(),
    listOwnCampusMemberships(user.id).catch(() => []),
  ]);
  const timezoneByChurchId = new Map(
    memberships.map((membership) => [
      membership.church_id,
      membership.church.timezone,
    ]),
  );
  const campusesByChurchId = new Map<string, typeof campusMemberships>();
  for (const row of campusMemberships) {
    const list = campusesByChurchId.get(row.church_id) ?? [];
    list.push(row);
    campusesByChurchId.set(row.church_id, list);
  }

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-muted-foreground">
          Signed in as {user.email}
        </p>
      </div>

      <ProfileAvatarForm profile={profile} />

      <ProfileForm profile={profile} />

      <ChangePasswordForm />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Your churches</CardTitle>
            <CardDescription>
              {memberships.length} active membership
              {memberships.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/select-church">
              <ArrowLeftRight className="h-4 w-4" />
              Switch church
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You are not a member of any church yet.{" "}
              <Link
                href="/onboarding/church"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Create a church
              </Link>{" "}
              or accept an invitation.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {memberships.map((membership) => (
                <li
                  key={membership.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{membership.church.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {labelForMembershipRole(membership.role)}
                      {membership.joined_at
                        ? ` · joined ${formatChurchDate(membership.joined_at, {
                            timeZone: membership.church.timezone,
                          })}`
                        : ""}
                    </p>
                    {(() => {
                      const campuses =
                        campusesByChurchId.get(membership.church_id) ?? [];
                      if (campuses.length === 0) {
                        return (
                          <p className="mt-1 text-xs text-muted-foreground">
                            No campus assignments
                          </p>
                        );
                      }
                      return (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {campuses.map((campus) => (
                            <li key={campus.id}>
                              {campus.campus_name}
                              {campus.is_primary_campus ? " (primary)" : ""}
                              {campus.has_implicit_all_campus_access &&
                              !campus.campus_id
                                ? " · implicit access"
                                : ` · ${labelForCampusRole(campus.campus_role)}`}
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                  <Badge variant={statusBadgeVariant(membership.status)}>
                    {labelForMembershipStatus(membership.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your campuses</CardTitle>
          <CardDescription>
            Campus assignments across your churches. Owners, co-owners,
            administrators, and security leaders also have implicit all-campus
            access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campusMemberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campus assignments yet. Ask an administrator to assign you to a
              campus, or apply migration 036 if campus memberships are not
              configured.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {campusMemberships.map((campus) => (
                <li
                  key={campus.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{campus.campus_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {campus.church_name}
                      {campus.campus_id
                        ? ` · ${labelForCampusRole(campus.campus_role)}`
                        : " · All campuses"}
                      {campus.is_primary_campus ? " · Primary" : ""}
                    </p>
                  </div>
                  {campus.has_implicit_all_campus_access ? (
                    <Badge variant="secondary">All-campus access</Badge>
                  ) : (
                    <Badge variant="outline">Assigned</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Your certifications</CardTitle>
            <CardDescription>
              {certifications.length} certification
              {certifications.length === 1 ? "" : "s"} matched to {user.email}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/certifications">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {certifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No certifications are linked to your email yet. Ask a leader to
              add a certification contact with this address, or add one under
              Certifications.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {certifications.map((cert) => (
                <li
                  key={cert.id}
                  className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{cert.certification_type}</p>
                    <p className="text-sm text-muted-foreground">
                      {[cert.issuer, cert.church_name].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires{" "}
                      {formatChurchDate(cert.expiration_date, {
                        timeZone: timezoneByChurchId.get(cert.church_id),
                      })}
                      {cert.certificate_number
                        ? ` · #${cert.certificate_number}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(cert.status)}>
                    {cert.status === "expiring_soon"
                      ? "Expiring soon"
                      : cert.status === "expired"
                        ? "Expired"
                        : "Active"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading profile…
            </CardContent>
          </Card>
        }
      >
        <ProfileContent />
      </Suspense>
    </div>
  );
}
