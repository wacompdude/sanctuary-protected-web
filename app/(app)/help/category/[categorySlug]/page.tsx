import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HelpArticleCard } from "@/components/help/help-article-card";
import { HelpBreadcrumbs } from "@/components/help/help-breadcrumbs";
import { HelpSearchForm } from "@/components/help/help-search-form";
import { Button } from "@/components/ui/button";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import {
  getHelpCategoryBySlug,
  listHelpArticlesByCategory,
  listHelpCategories,
} from "@/lib/help/queries";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ categorySlug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { categorySlug } = await params;
  return {
    title: `Help · ${categorySlug}`,
    robots: { index: false, follow: false },
  };
}

async function HelpCategoryContent({ params }: PageProps) {
  await getAuthenticatedUserWithChurch();
  const { categorySlug } = await params;

  const category = await getHelpCategoryBySlug(categorySlug);
  if (!category) notFound();

  const [articles, allCategories] = await Promise.all([
    listHelpArticlesByCategory(category.id),
    listHelpCategories(),
  ]);

  const parent = category.parent_category_id
    ? allCategories.find((item) => item.id === category.parent_category_id)
    : null;

  const children = allCategories.filter(
    (item) => item.parent_category_id === category.id,
  );

  const crumbs = [
    { label: "Help Center", href: "/help" },
    ...(parent
      ? [{ label: parent.name, href: `/help/category/${parent.slug}` }]
      : []),
    { label: category.name },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <HelpBreadcrumbs items={crumbs} />

      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/help">
            <ArrowLeft className="h-4 w-4" />
            Back to Help Center
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
        {category.description ? (
          <p className="mt-1 text-muted-foreground">{category.description}</p>
        ) : null}
      </div>

      <HelpSearchForm size="default" />

      {children.length > 0 ? (
        <section className="space-y-2" aria-labelledby="help-subtopics-heading">
          <h2
            id="help-subtopics-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Subtopics
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/help/category/${child.slug}`}
                  className="block rounded-md border px-3 py-2 hover:bg-muted/50"
                >
                  <span className="font-medium">{child.name}</span>
                  {child.description ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2">
                      {child.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="help-category-articles">
        <h2
          id="help-category-articles"
          className="text-lg font-semibold tracking-tight"
        >
          Articles
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({articles.length})
          </span>
        </h2>

        {articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No published articles in this topic yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {articles.map((article) => (
              <HelpArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function HelpCategoryPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">Help topic</h1>
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <HelpCategoryContentWrapper {...props} />
    </Suspense>
  );
}

async function HelpCategoryContentWrapper(props: PageProps) {
  try {
    return await HelpCategoryContent(props);
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    throw error;
  }
}
