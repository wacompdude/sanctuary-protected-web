import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  labelForCampusStatus,
  labelForCampusType,
} from "@/lib/campuses/constants";
import {
  canManageCampuses,
  canViewCampuses,
} from "@/lib/campuses/permissions";
import { formatAddress, listCampuses } from "@/lib/campuses/queries";
import { formatChurchDate } from "@/lib/datetime/format";

async function CampusesContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canViewCampuses(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have permission to view campuses.
        </CardContent>
      </Card>
    );
  }

  const result = await listCampuses(church.id, { includeArchived: true });
  const canManage = canManageCampuses(membership.role);

  if (!result.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Campuses not configured</CardTitle>
          <CardDescription>
            {result.hint ??
              "Apply supabase/migrations/036_campus_management.sql in the Supabase SQL Editor, then reload."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campuses</h1>
          <p className="mt-1 text-muted-foreground">
            Locations and operational sites for {church.name}.
          </p>
        </div>
        {canManage ? (
          <Button asChild className="h-11">
            <Link href="/campuses/new">
              <Plus className="h-4 w-4" />
              New campus
            </Link>
          </Button>
        ) : null}
      </div>

      {!result.extendedSchema ? (
        <Card>
          <CardHeader>
            <CardTitle>Extended campus fields unavailable</CardTitle>
            <CardDescription>
              Basic campus records are available. Apply{" "}
              <code>supabase/migrations/036_campus_management.sql</code> for
              types, primary campus, contacts, and memberships.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            {result.items.length} campus
            {result.items.length === 1 ? "" : "es"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campuses found.{" "}
              {canManage
                ? "Create a campus to get started."
                : "Ask an administrator to add campuses."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Name
                    </th>
                    {result.extendedSchema ? (
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">
                        Type
                      </th>
                    ) : null}
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Location
                    </th>
                    {result.extendedSchema ? (
                      <th className="pb-3 pr-4 font-medium text-muted-foreground">
                        Members
                      </th>
                    ) : null}
                    <th className="pb-3 font-medium text-muted-foreground">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((campus) => (
                    <tr
                      key={campus.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          href={`/campuses/${campus.id}`}
                          className="hover:underline"
                        >
                          {campus.name}
                        </Link>
                        {campus.is_primary ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Primary
                          </span>
                        ) : null}
                      </td>
                      {result.extendedSchema ? (
                        <td className="py-3 pr-4 text-muted-foreground">
                          {labelForCampusType(campus.campus_type)}
                        </td>
                      ) : null}
                      <td className="py-3 pr-4 text-muted-foreground">
                        {labelForCampusStatus(campus.status)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatAddress(campus) || "—"}
                      </td>
                      {result.extendedSchema ? (
                        <td className="py-3 pr-4 text-muted-foreground">
                          {campus.member_count ?? 0}
                        </td>
                      ) : null}
                      <td className="py-3 text-muted-foreground">
                        {formatChurchDate(campus.updated_at, {
                          timeZone: church.timezone,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function CampusesPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading campuses…
            </CardContent>
          </Card>
        }
      >
        <CampusesLoader />
      </Suspense>
    </div>
  );
}

async function CampusesLoader() {
  try {
    return <CampusesContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load campuses."}
        </CardContent>
      </Card>
    );
  }
}
