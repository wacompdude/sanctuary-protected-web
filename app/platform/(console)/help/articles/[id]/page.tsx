import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { HelpArticleForm } from "@/components/platform/help-article-form";
import { HelpReviewDueForm } from "@/components/platform/help-review-due-form";
import { HelpStepsEditor } from "@/components/platform/help-steps-editor";
import { HelpWorkflowActions } from "@/components/platform/help-workflow-actions";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { PlatformButton } from "@/components/platform/platform-button";
import {
  getHelpArticleForAdmin,
  listHelpCategoriesForAdmin,
} from "@/lib/help/admin";
import {
  canDeleteHelpArticles,
  canManageHelpContent,
  canPublishHelp,
  requireHelpPermission,
} from "@/lib/help/permissions";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function HelpArticleEditContent({ params }: PageProps) {
  const context = await requireHelpPermission(
    "help.read_drafts",
    "help.console.access",
    "help.update",
  );
  const { id } = await params;

  const [article, categories] = await Promise.all([
    getHelpArticleForAdmin(id),
    listHelpCategoriesForAdmin({ includeArchived: true }),
  ]);

  if (!article) notFound();

  const canUpdate = canManageHelpContent(context.permissions);
  const canPublish = canPublishHelp(context.permissions);
  const canArchive =
    context.permissions.has("help.manage") ||
    context.permissions.has("help.archive");
  const canDelete = canDeleteHelpArticles(context.permissions);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <PlatformStatusBadge status={article.status} />
            {article.published_version_number ? (
              <span className="text-xs text-slate-400">
                Published v{article.published_version_number}
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {article.title}
          </h1>
          <p className="mt-1 font-mono text-sm text-slate-400">{article.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PlatformButton variant="outline" asChild>
            <Link href={`/platform/help/articles/${article.id}/versions`}>
              Versions
            </Link>
          </PlatformButton>
          <PlatformButton variant="outline" asChild>
            <Link href="/platform/help">Back to list</Link>
          </PlatformButton>
        </div>
      </div>

      <HelpWorkflowActions
        articleId={article.id}
        articleTitle={article.title}
        status={article.status}
        canPublish={canPublish}
        canArchive={canArchive}
        canUpdate={canUpdate}
        canDelete={canDelete}
        publishedSlug={
          article.status === "published" || article.published_version_id
            ? article.slug
            : null
        }
      />

      {canUpdate ? (
        <HelpReviewDueForm
          articleId={article.id}
          reviewDueAt={article.review_due_at}
        />
      ) : null}

      {canUpdate ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Article details</h2>
          <HelpArticleForm article={article} categories={categories} />
        </section>
      ) : (
        <section className="rounded-lg border border-slate-800 p-4 text-sm text-slate-300">
          <p className="font-medium">{article.title}</p>
          {article.summary ? (
            <p className="mt-2 text-slate-400">{article.summary}</p>
          ) : null}
          <p className="mt-4 whitespace-pre-wrap text-slate-400">
            {article.body_content}
          </p>
        </section>
      )}

      <HelpStepsEditor
        articleId={article.id}
        steps={article.steps}
        canEdit={canUpdate}
      />
    </div>
  );
}

export default function HelpArticleEditPage(props: PageProps) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading article…</div>}>
      <HelpArticleEditContentWrapper {...props} />
    </Suspense>
  );
}

async function HelpArticleEditContentWrapper(props: PageProps) {
  try {
    return await HelpArticleEditContent(props);
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
    throw error;
  }
}
