import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { recordHelpArticleViewAction } from "@/app/(app)/help/actions";
import { HelpArticleSteps } from "@/components/help/help-article-steps";
import { HelpBreadcrumbs } from "@/components/help/help-breadcrumbs";
import { HelpFeedbackForm } from "@/components/help/help-feedback-form";
import { HelpPlanNotices } from "@/components/help/help-plan-notices";
import { HelpRelatedArticles } from "@/components/help/help-related-articles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { labelForHelpArticleType } from "@/lib/help/constants";
import { isHelpDeepLinkPath } from "@/lib/help/deep-links";
import { resolveHelpFeatureNoticesForChurch } from "@/lib/help/feature-notices";
import {
  getHelpArticleBySlug,
  getHelpCategoryBySlug,
} from "@/lib/help/queries";
import { PolicyMarkdown } from "@/lib/policies/markdown";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ articleSlug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { articleSlug } = await params;
  const article = await getHelpArticleBySlug(articleSlug);
  return {
    title: article ? `${article.title} · Help` : "Help article",
    robots: { index: false, follow: false },
  };
}

async function HelpArticleContent({ params }: PageProps) {
  const { church } = await getAuthenticatedUserWithChurch();
  const { articleSlug } = await params;

  const article = await getHelpArticleBySlug(articleSlug);
  if (!article) notFound();

  await recordHelpArticleViewAction({
    articleId: article.id,
    articleVersionId: article.published_version_id,
  });

  const [notices, category] = await Promise.all([
    resolveHelpFeatureNoticesForChurch({
      organizationId: church.id,
      featureKeys: article.feature_keys,
      planKeysOverride: article.plan_keys,
    }),
    article.category_slug
      ? getHelpCategoryBySlug(article.category_slug)
      : Promise.resolve(null),
  ]);

  const supportPath =
    article.support_cta_path && isHelpDeepLinkPath(article.support_cta_path)
      ? article.support_cta_path
      : "/help";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <HelpBreadcrumbs
        items={[
          { label: "Help Center", href: "/help" },
          ...(category
            ? [
                {
                  label: category.name,
                  href: `/help/category/${category.slug}`,
                },
              ]
            : []),
          { label: article.title },
        ]}
      />

      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link
            href={
              category ? `/help/category/${category.slug}` : "/help"
            }
          >
            <ArrowLeft className="h-4 w-4" />
            {category ? `Back to ${category.name}` : "Back to Help Center"}
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {labelForHelpArticleType(article.article_type)}
          </Badge>
          {article.difficulty ? (
            <Badge variant="outline" className="capitalize">
              {article.difficulty}
            </Badge>
          ) : null}
          {article.estimated_minutes ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {article.estimated_minutes} min
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          {article.title}
        </h1>
        {article.summary ? (
          <p className="mt-2 text-lg text-muted-foreground">{article.summary}</p>
        ) : null}
      </div>

      <HelpPlanNotices notices={notices} />

      {article.prerequisites.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prerequisites</CardTitle>
            <CardDescription>
              Complete these before starting the steps below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {article.prerequisites.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {article.body_content.trim() ? (
        <section
          className="prose-help space-y-3"
          aria-labelledby="help-overview-heading"
        >
          <h2
            id="help-overview-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Overview
          </h2>
          <PolicyMarkdown content={article.body_content} />
        </section>
      ) : null}

      <HelpArticleSteps steps={article.steps} />

      {article.expected_result ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expected result</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{article.expected_result}</p>
          </CardContent>
        </Card>
      ) : null}

      <HelpRelatedArticles relations={article.relations} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback</CardTitle>
          <CardDescription>
            Tell us whether this article answered your question.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HelpFeedbackForm
            articleId={article.id}
            articleSlug={article.slug}
            articleVersionId={article.published_version_id}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Still need help?</CardTitle>
          <CardDescription>
            Contact your church administrator or continue browsing the Help
            Center.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={supportPath}>
              {article.support_cta_label || "Back to Help Center"}
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/help/search">Search again</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HelpArticlePage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">Help article</h1>
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <HelpArticleContentWrapper {...props} />
    </Suspense>
  );
}

async function HelpArticleContentWrapper(props: PageProps) {
  try {
    return await HelpArticleContent(props);
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    throw error;
  }
}
