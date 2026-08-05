import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { HelpArticleCard } from "@/components/help/help-article-card";
import { HelpBreadcrumbs } from "@/components/help/help-breadcrumbs";
import { HelpSearchForm } from "@/components/help/help-search-form";
import { Button } from "@/components/ui/button";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import {
  recordHelpSearchEvent,
  searchHelpArticles,
} from "@/lib/help/queries";
import { validateHelpSearchQuery } from "@/lib/help/validation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Help",
  robots: { index: false, follow: false },
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function HelpSearchContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { church, user } = await getAuthenticatedUserWithChurch();
  const params = await searchParams;
  const rawQuery = firstParam(params.q) ?? "";
  const categoryId = firstParam(params.category) ?? null;
  const articleType = firstParam(params.type) ?? null;

  const validated = validateHelpSearchQuery(rawQuery, {
    categoryId,
    articleType: articleType || undefined,
  });

  const page =
    validated.data != null
      ? await searchHelpArticles({
          query: validated.data.query,
          limit: validated.data.limit,
          offset: validated.data.offset,
          categoryId: validated.data.categoryId,
          articleType: validated.data.articleType,
        })
      : { query: rawQuery.trim(), results: [], result_count: 0 };

  if (validated.data) {
    await recordHelpSearchEvent({
      query: page.query,
      resultCount: page.result_count,
      organizationId: church.id,
      userId: user.id,
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <HelpBreadcrumbs
        items={[
          { label: "Help Center", href: "/help" },
          { label: "Search" },
        ]}
      />

      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/help">
            <ArrowLeft className="h-4 w-4" />
            Back to Help Center
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Search help</h1>
        <p className="mt-1 text-muted-foreground">
          Results for {church.name}
        </p>
      </div>

      <HelpSearchForm defaultQuery={rawQuery} size="large" autoFocus={!rawQuery} />

      {validated.error && rawQuery.trim() ? (
        <p className="text-sm text-destructive" role="alert">
          {validated.error}
        </p>
      ) : null}

      {!rawQuery.trim() ? (
        <p className="text-sm text-muted-foreground">
          Enter a search term to find articles.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {page.result_count === 0
              ? `No results for “${page.query}”.`
              : `${page.result_count} result${page.result_count === 1 ? "" : "s"} for “${page.query}”.`}
          </p>

          {page.result_count === 0 ? (
            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              <p>Try fewer words, a feature name, or browse topics from the Help Center home.</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link href="/help">Browse topics</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {page.results.map((result) => (
                <HelpArticleCard key={result.article_id} article={result} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HelpSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">Search help</h1>
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <HelpSearchContentWrapper searchParams={searchParams} />
    </Suspense>
  );
}

async function HelpSearchContentWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return await HelpSearchContent({ searchParams });
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    throw error;
  }
}
