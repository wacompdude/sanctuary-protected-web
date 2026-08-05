import Link from "next/link";
import { Suspense } from "react";
import { CircleHelp, LifeBuoy } from "lucide-react";
import { HelpArticleCard } from "@/components/help/help-article-card";
import { HelpCategoryTree } from "@/components/help/help-category-tree";
import { HelpEmptyState } from "@/components/help/help-empty-state";
import { HelpSearchForm } from "@/components/help/help-search-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import {
  listFeaturedHelpArticles,
  listHelpCategoryTree,
  listPopularHelpArticles,
} from "@/lib/help/queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help Center",
  robots: { index: false, follow: false },
};

async function HelpHomeContent() {
  const { church } = await getAuthenticatedUserWithChurch();

  const [tree, featured, popular] = await Promise.all([
    listHelpCategoryTree(),
    listFeaturedHelpArticles(6),
    listPopularHelpArticles(6),
  ]);

  const hasAnyContent =
    tree.length > 0 || featured.length > 0 || popular.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border bg-muted/40 p-2">
            <CircleHelp className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Help Center</h1>
            <p className="mt-1 text-muted-foreground">
              Guides and step-by-step workflows for {church.name}. Available on
              every plan.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Search help</CardTitle>
            <CardDescription>
              Find articles by topic, feature, or common task.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HelpSearchForm size="large" autoFocus />
          </CardContent>
        </Card>
      </div>

      {!hasAnyContent ? (
        <HelpEmptyState
          title="No help content yet"
          description="Published topics and articles will appear here after Help Center content is configured."
        />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <HelpCategoryTree tree={tree} />

        <div className="space-y-8">
          {featured.length > 0 ? (
            <section className="space-y-3" aria-labelledby="help-featured-heading">
              <h2
                id="help-featured-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Featured
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {featured.map((article) => (
                  <HelpArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ) : null}

          {popular.length > 0 ? (
            <section className="space-y-3" aria-labelledby="help-popular-heading">
              <h2
                id="help-popular-heading"
                className="text-xl font-semibold tracking-tight"
              >
                Popular
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {popular.map((article) => (
                  <HelpArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LifeBuoy className="h-5 w-5" aria-hidden />
            Still need help?
          </CardTitle>
          <CardDescription>
            If an article does not resolve your issue, contact your church
            administrator or Sanctuary Protected support.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/settings/account">Open account settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HelpHomePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">Help Center</h1>
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <HelpHomeContentWrapper />
    </Suspense>
  );
}

async function HelpHomeContentWrapper() {
  try {
    return await HelpHomeContent();
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    throw error;
  }
}
