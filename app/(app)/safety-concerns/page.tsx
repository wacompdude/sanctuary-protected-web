import Link from "next/link";
import { Suspense } from "react";
import { LayoutList, Plus, Rows3, ShieldAlert } from "lucide-react";
import { SafetyConcernBrowse } from "@/components/safety-concerns/safety-concern-browse";
import { SafetyConcernFilters } from "@/components/safety-concerns/safety-concern-filters";
import {
  SafetyConcernList,
  type SafetyConcernListRow,
} from "@/components/safety-concerns/safety-concern-list";
import { SafetyConcernRestrictedBanner } from "@/components/safety-concerns/restricted-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listAccessibleCampuses } from "@/lib/campuses/filter";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { hasMinRole } from "@/lib/organization/navigation";
import {
  canManageSafetyConcerns,
  getSafetyConcernAccess,
  getSafetyConcernChurchSettings,
  listSafetyConcernBrowseItems,
  listSafetyConcernProfiles,
  SAFETY_CONCERN_BROWSE_STATUSES,
} from "@/lib/safety-concerns";
import { attachSignedUrlsToSafetyConcernPhotos } from "@/lib/safety-concerns/photo-urls";
import type {
  SafetyConcernListOptions,
  SafetyConcernPhoto,
  SafetyConcernProfileStatus,
  SafetyConcernRestrictionType,
} from "@/lib/safety-concerns/types";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Known Safety Concerns",
  robots: { index: false, follow: false },
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseListOptions(params: {
  q?: string;
  status?: string;
  restriction?: string;
  campus?: string;
  incident?: string;
  reviewDue?: string;
  canManage: boolean;
}): SafetyConcernListOptions {
  const status = params.status?.trim() as SafetyConcernProfileStatus | "";
  const restriction = params.restriction?.trim() as
    | SafetyConcernRestrictionType
    | "";
  const includeArchived = status === "archived" || status === "draft";

  return {
    search: params.q?.trim() || null,
    status: status || undefined,
    restrictionType: restriction || null,
    campusId: params.campus?.trim() || null,
    linkedIncidentId: params.incident?.trim() || null,
    reviewDue: params.reviewDue === "1",
    includeInactive: params.canManage && (includeArchived || !status),
  };
}

async function loadListRows(
  organizationId: string,
  options: SafetyConcernListOptions,
): Promise<SafetyConcernListRow[]> {
  const supabase = await createClient();
  const profiles = await listSafetyConcernProfiles(organizationId, options, supabase);
  if (profiles.length === 0) return [];

  const profileIds = profiles.map((profile) => profile.id);
  const { data: photoRows } = await supabase
    .from("safety_concern_photos")
    .select("*")
    .eq("organization_id", organizationId)
    .in("profile_id", profileIds)
    .is("archived_at", null)
    .order("display_order", { ascending: true });

  const primaryByProfile = new Map<string, SafetyConcernPhoto>();
  for (const row of (photoRows ?? []) as SafetyConcernPhoto[]) {
    const existing = primaryByProfile.get(row.profile_id);
    if (!existing || row.is_primary) {
      primaryByProfile.set(row.profile_id, row);
    }
  }

  const signed = await attachSignedUrlsToSafetyConcernPhotos({
    supabase,
    organizationId,
    photos: [...primaryByProfile.values()],
  });
  const urlByProfile = new Map<string, string | null>();
  for (const photo of signed) {
    urlByProfile.set(photo.profile_id, photo.signed_url ?? null);
  }

  const { data: campusLinkRows } = await supabase
    .from("safety_concern_profile_campuses")
    .select("profile_id, campus_id")
    .eq("organization_id", organizationId)
    .in("profile_id", profileIds);

  const campusIds = [
    ...new Set(
      (campusLinkRows ?? []).map((row) => String(row.campus_id)).filter(Boolean),
    ),
  ];
  const campusNameById = new Map<string, string>();
  if (campusIds.length > 0) {
    const { data: campusRows } = await supabase
      .from("campuses")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", campusIds);
    for (const campus of campusRows ?? []) {
      campusNameById.set(String(campus.id), String(campus.name ?? ""));
    }
  }

  const campusNamesByProfile = new Map<string, string[]>();
  for (const row of campusLinkRows ?? []) {
    const profileId = String(row.profile_id);
    const name = campusNameById.get(String(row.campus_id)) ?? "";
    if (!name) continue;
    const list = campusNamesByProfile.get(profileId) ?? [];
    list.push(name);
    campusNamesByProfile.set(profileId, list);
  }

  return profiles.map((profile) => {
    const names = campusNamesByProfile.get(profile.id) ?? [];
    return {
      ...profile,
      primaryPhotoUrl: urlByProfile.get(profile.id) ?? null,
      campusLabel:
        names.length > 0
          ? names.join(", ")
          : profile.scope_type === "church_wide"
            ? "Church-wide"
            : "",
    };
  });
}

async function SafetyConcernsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const settings = await getSafetyConcernChurchSettings(church.id);
  const access = await getSafetyConcernAccess({
    organizationId: church.id,
    role: membership.role,
    allowSecurityMemberView: settings.allow_security_member_view,
  });

  if (!access.canRead) {
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight">
          Known Safety Concerns
        </h1>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldAlert className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>{access.upgradeMessage}</CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  const canManage = access.canWrite && canManageSafetyConcerns(membership.role);
  const prefersListDefault = hasMinRole(membership.role, "security_leader");
  const viewParam = firstParam(params.view);
  const view: "browse" | "list" =
    viewParam === "browse" || viewParam === "list"
      ? viewParam
      : prefersListDefault
        ? "list"
        : "browse";

  const listOptions = parseListOptions({
    q: firstParam(params.q),
    status: firstParam(params.status),
    restriction: firstParam(params.restriction),
    campus: firstParam(params.campus),
    incident: firstParam(params.incident),
    reviewDue: firstParam(params.reviewDue),
    canManage,
  });

  // Browse carousel stays on the active security set unless a status filter is set.
  const browseOptions: SafetyConcernListOptions = {
    ...listOptions,
    includeInactive: false,
    status: listOptions.status ?? SAFETY_CONCERN_BROWSE_STATUSES,
  };

  const { campuses } = await listAccessibleCampuses({
    organizationId: church.id,
    userId: user.id,
    role: membership.role,
  });

  const filterQuery = new URLSearchParams();
  for (const key of ["q", "status", "restriction", "campus", "incident", "reviewDue"] as const) {
    const value = firstParam(params[key]);
    if (value) filterQuery.set(key, value);
  }
  const filterSuffix = filterQuery.toString();
  const browseHref = `/safety-concerns?view=browse${filterSuffix ? `&${filterSuffix}` : ""}`;
  const listHref = `/safety-concerns?view=list${filterSuffix ? `&${filterSuffix}` : ""}`;

  const [browseItems, listRows] = await Promise.all([
    view === "browse"
      ? listSafetyConcernBrowseItems(church.id, browseOptions)
      : Promise.resolve([]),
    view === "list"
      ? loadListRows(church.id, {
          ...listOptions,
          includeInactive: canManage,
          status:
            listOptions.status ??
            (canManage ? undefined : SAFETY_CONCERN_BROWSE_STATUSES),
        })
      : Promise.resolve([] as SafetyConcernListRow[]),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Known Safety Concerns
          </h1>
          <p className="mt-1 text-muted-foreground">
            Restricted Safety Concern Profiles for {church.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant={view === "browse" ? "default" : "outline"}
            className="h-11"
          >
            <Link href={browseHref}>
              <Rows3 className="h-4 w-4" />
              Browse
            </Link>
          </Button>
          <Button
            asChild
            variant={view === "list" ? "default" : "outline"}
            className="h-11"
          >
            <Link href={listHref}>
              <LayoutList className="h-4 w-4" />
              List
            </Link>
          </Button>
          {canManage ? (
            <Button asChild className="h-11">
              <Link href="/safety-concerns/new">
                <Plus className="h-4 w-4" />
                New profile
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <SafetyConcernRestrictedBanner />

      {access.readOnly ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {access.upgradeMessage} Existing profiles are available in read-only
          mode.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Search and filters</CardTitle>
          <CardDescription>
            Text search covers name and aliases on authorized profiles only. No
            biometric or image matching.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SafetyConcernFilters
            campuses={campuses.map((campus) => ({
              id: campus.id,
              name: campus.name,
            }))}
            canManage={canManage}
            view={view}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{view === "browse" ? "Quick browse" : "Profiles"}</CardTitle>
          <CardDescription>
            {view === "browse"
              ? `${browseItems.length} profile${browseItems.length === 1 ? "" : "s"} in the browse set.`
              : `${listRows.length} profile${listRows.length === 1 ? "" : "s"} in scope.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view === "browse" ? (
            <SafetyConcernBrowse items={browseItems} canManage={canManage} />
          ) : (
            <SafetyConcernList rows={listRows} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function SafetyConcernsWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <SafetyConcernsContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Unable to load Safety Concern Profiles."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function SafetyConcernsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
        <SafetyConcernsWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
