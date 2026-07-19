import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, ClipboardCheck, Plus, Settings2 } from "lucide-react";
import { EmergencyPolicyCard } from "@/components/policies/emergency-policy-card";
import { PolicyCard } from "@/components/policies/policy-card";
import { PolicyLibraryFilters } from "@/components/policies/policy-library-filters";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { POLICY_MIGRATION_HINT } from "@/lib/policies/constants";
import {
  canManagePolicyDocuments,
  canViewPolicyManagement,
} from "@/lib/policies/permissions";
import {
  getPublishedPolicies,
  listCampusesForPolicies,
  listPolicyCategories,
} from "@/lib/policies/queries";
import type { PolicyDocumentType } from "@/lib/policies/types";

async function PoliciesLibraryContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManagePolicyDocuments(membership.role);
  const canManageView = canViewPolicyManagement(membership.role);

  const q = typeof params.q === "string" ? params.q : "";
  const type = typeof params.type === "string" ? params.type : "";
  const category = typeof params.category === "string" ? params.category : "";
  const campus = typeof params.campus === "string" ? params.campus : "";
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;

  const [library, categories, campuses] = await Promise.all([
    getPublishedPolicies(church.id, {
      q,
      documentType: (type || "") as PolicyDocumentType | "",
      categoryId: category || undefined,
      campusId: campus || undefined,
      emergencyOnly: params.emergency === "1",
      acknowledgmentRequired: params.ack === "1",
      page,
    }),
    listPolicyCategories(church.id),
    listCampusesForPolicies(church.id),
  ]);

  if (!library.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Policies & Procedures</CardTitle>
          <CardDescription>{POLICY_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(library.total / library.pageSize));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Policies & Procedures
          </h1>
          <p className="mt-1 text-muted-foreground">
            Published safety and security documents for {church.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {library.myPendingAcknowledgments > 0 ? (
            <Button variant="outline" asChild>
              <Link href="/policies/acknowledgments">
                <ClipboardCheck className="h-4 w-4" />
                {library.myPendingAcknowledgments} to acknowledge
              </Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/policies/acknowledgments">
                <ClipboardCheck className="h-4 w-4" />
                Acknowledgments
              </Link>
            </Button>
          )}
          {canManageView ? (
            <Button variant="outline" asChild>
              <Link href="/policies/manage">
                <Settings2 className="h-4 w-4" />
                Manage
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button asChild>
              <Link href="/policies/new">
                <Plus className="h-4 w-4" />
                New policy
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {library.emergency.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Emergency documents
            </h2>
            <p className="text-sm text-muted-foreground">
              Fast access to critical response plans.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {library.emergency.map((policy) => (
              <EmergencyPolicyCard key={policy.id} policy={policy} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Published policies</CardDescription>
            <CardTitle className="text-2xl">{library.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Required acknowledgments</CardDescription>
            <CardTitle className="text-2xl">
              {library.myPendingAcknowledgments}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Emergency documents</CardDescription>
            <CardTitle className="text-2xl">{library.emergency.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {library.featured.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Featured</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {library.featured.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                timeZone={church.timezone}
              />
            ))}
          </div>
        </section>
      ) : null}

      {library.recentlyUpdated.length > 0 && !q && !type && !category ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Recently updated
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {library.recentlyUpdated.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                timeZone={church.timezone}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Policy library
          </CardTitle>
          <CardDescription>
            Search and filter published policies and procedures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Suspense fallback={null}>
            <PolicyLibraryFilters
              categories={categories}
              campuses={campuses}
            />
          </Suspense>

          {library.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No published policies match these filters.
              {canManage ? (
                <>
                  {" "}
                  <Link
                    href="/policies/new"
                    className="underline underline-offset-4"
                  >
                    Create the first policy
                  </Link>
                  .
                </>
              ) : null}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {library.items.map((policy) => (
                <PolicyCard
                  key={policy.id}
                  policy={policy}
                  timeZone={church.timezone}
                />
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Page {library.page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {library.page > 1 ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/policies?${new URLSearchParams({
                        ...(q ? { q } : {}),
                        ...(type ? { type } : {}),
                        ...(category ? { category } : {}),
                        ...(campus ? { campus } : {}),
                        ...(params.emergency === "1" ? { emergency: "1" } : {}),
                        ...(params.ack === "1" ? { ack: "1" } : {}),
                        page: String(library.page - 1),
                      }).toString()}`}
                    >
                      Previous
                    </Link>
                  </Button>
                ) : null}
                {library.page < totalPages ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/policies?${new URLSearchParams({
                        ...(q ? { q } : {}),
                        ...(type ? { type } : {}),
                        ...(category ? { category } : {}),
                        ...(campus ? { campus } : {}),
                        ...(params.emergency === "1" ? { emergency: "1" } : {}),
                        ...(params.ack === "1" ? { ack: "1" } : {}),
                        page: String(library.page + 1),
                      }).toString()}`}
                    >
                      Next
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

async function PoliciesLibraryWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <PoliciesLibraryContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load policies."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function PoliciesPage({
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
              Loading policies…
            </CardContent>
          </Card>
        }
      >
        <PoliciesLibraryWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
