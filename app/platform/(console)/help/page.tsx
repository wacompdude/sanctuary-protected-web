import Link from "next/link";
import { Suspense } from "react";
import { deleteHelpArticleAction } from "@/app/platform/help-actions";
import { HelpDeleteButton } from "@/components/platform/help-delete-button";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { PlatformButton } from "@/components/platform/platform-button";
import { Input } from "@/components/ui/input";
import {
  getHelpAdminDashboardStats,
  listHelpArticlesForAdmin,
} from "@/lib/help/admin";
import { labelForHelpArticleType } from "@/lib/help/constants";
import {
  canDeleteHelpArticles,
  canManageHelpContent,
  canPublishHelp,
  canReadHelpAnalytics,
  requireHelpPermission,
} from "@/lib/help/permissions";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import type { HelpArticleStatus } from "@/lib/help/types";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function HelpDashboardContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireHelpPermission(
    "help.console.access",
    "help.read_drafts",
  );
  const params = await searchParams;
  const q = firstParam(params.q) ?? "";
  const status = (firstParam(params.status) ?? "") as HelpArticleStatus | "";

  const [stats, articles] = await Promise.all([
    getHelpAdminDashboardStats(),
    listHelpArticlesForAdmin({ q, status }),
  ]);

  const canCreate = canManageHelpContent(context.permissions);
  const canPublish = canPublishHelp(context.permissions);
  const canAnalytics = canReadHelpAnalytics(context.permissions);
  const canDelete = canDeleteHelpArticles(context.permissions);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Help Center</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage global Help categories, articles, steps, and publication.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PlatformButton variant="outline" asChild>
            <Link href="/platform/help/categories">Categories</Link>
          </PlatformButton>
          {canAnalytics ? (
            <PlatformButton variant="outline" asChild>
              <Link href="/platform/help/analytics">Analytics</Link>
            </PlatformButton>
          ) : null}
          {canCreate ? (
            <PlatformButton asChild>
              <Link href="/platform/help/articles/new">New article</Link>
            </PlatformButton>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Published", stats.published],
          ["Draft", stats.draft],
          ["In review", stats.in_review],
          ["Archived", stats.archived],
          ["Active categories", stats.categories_active],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3"
          >
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search title, slug, summary"
          className="max-w-sm border-slate-700 bg-slate-900"
        />
        <select
          name="status"
          defaultValue={status}
          className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <PlatformButton type="submit" variant="outline">
          Filter
        </PlatformButton>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Version</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-400">
                  No articles match this filter.
                  {canCreate ? " Create a draft to get started." : null}
                </td>
              </tr>
            ) : (
              articles.map((article) => (
                <tr key={article.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    <div className="font-medium">{article.title}</div>
                    <div className="font-mono text-xs text-slate-500">
                      {article.slug}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {article.category_name ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {labelForHelpArticleType(article.article_type)}
                  </td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={article.status} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-400">
                    {article.published_version_number
                      ? `v${article.published_version_number}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <PlatformButton variant="ghost" size="sm" asChild>
                        <Link href={`/platform/help/articles/${article.id}`}>
                          {canPublish || canCreate ? "Edit" : "View"}
                        </Link>
                      </PlatformButton>
                      {canDelete ? (
                        <HelpDeleteButton
                          action={deleteHelpArticleAction}
                          confirmMessage={`Permanently delete “${article.title}”? Versions, steps, and feedback for this article will also be removed. This cannot be undone.`}
                          hiddenFields={{ article_id: article.id }}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlatformHelpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading Help…</div>}>
      <HelpDashboardContentWrapper searchParams={searchParams} />
    </Suspense>
  );
}

async function HelpDashboardContentWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return await HelpDashboardContent({ searchParams });
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
    throw error;
  }
}
