import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { PolicyManageFilters } from "@/components/policies/policy-manage-filters";
import { PolicyManageTable } from "@/components/policies/policy-manage-table";
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
  requireMinChurchRole,
} from "@/lib/church/auth";
import { POLICY_MIGRATION_HINT } from "@/lib/policies/constants";
import {
  listCampusesForPolicies,
  listManagedPolicies,
  listPolicyCategories,
} from "@/lib/policies/queries";
import type { PolicyDocumentStatus, PolicyDocumentType } from "@/lib/policies/types";

async function ManagePoliciesContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church } = await requireMinChurchRole("security_leader");

  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const type = typeof params.type === "string" ? params.type : "";
  const category = typeof params.category === "string" ? params.category : "";
  const campus = typeof params.campus === "string" ? params.campus : "";
  const includeArchived = params.archived === "1";
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;

  const [result, categories, campuses] = await Promise.all([
    listManagedPolicies(church.id, {
      q,
      status: (status || "") as PolicyDocumentStatus | "",
      documentType: (type || "") as PolicyDocumentType | "",
      categoryId: category || undefined,
      campusId: campus || undefined,
      includeArchived,
      page,
    }),
    listPolicyCategories(church.id),
    listCampusesForPolicies(church.id),
  ]);

  if (!result.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Manage policies</CardTitle>
          <CardDescription>{POLICY_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
            <Link href="/policies">
              <ArrowLeft className="h-4 w-4" />
              Back to library
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Manage policies</h1>
          <p className="mt-1 text-muted-foreground">
            Drafts, review workflow, and publication for {church.name}.
          </p>
        </div>
        <Button asChild>
          <Link href="/policies/new">
            <Plus className="h-4 w-4" />
            New policy
          </Link>
        </Button>
      </div>

      <PolicyManageFilters
        categories={categories}
        campuses={campuses}
        values={{
          q,
          status,
          type,
          category,
          campus,
          archived: includeArchived,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>All documents</CardTitle>
          <CardDescription>
            {result.total} polic{result.total === 1 ? "y" : "ies"}
            {result.total > 0
              ? ` · page ${result.page} of ${totalPages}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PolicyManageTable
            items={result.items}
            timeZone={church.timezone}
          />
          {totalPages > 1 ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: totalPages }, (_, index) => {
                const pageNumber = index + 1;
                const sp = new URLSearchParams();
                if (q) sp.set("q", q);
                if (status) sp.set("status", status);
                if (type) sp.set("type", type);
                if (category) sp.set("category", category);
                if (campus) sp.set("campus", campus);
                if (includeArchived) sp.set("archived", "1");
                sp.set("page", String(pageNumber));
                return (
                  <Button
                    key={pageNumber}
                    variant={pageNumber === result.page ? "default" : "outline"}
                    size="sm"
                    asChild
                  >
                    <Link href={`/policies/manage?${sp.toString()}`}>
                      {pageNumber}
                    </Link>
                  </Button>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

async function ManagePoliciesWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <ManagePoliciesContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof ChurchAccessError || error instanceof Error
            ? error.message
            : "Unable to open policy management."}
        </CardContent>
      </Card>
    );
  }
}

export default function ManagePoliciesPage({
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
        <ManagePoliciesWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
