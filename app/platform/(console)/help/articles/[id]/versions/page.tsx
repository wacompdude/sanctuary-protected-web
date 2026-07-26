import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { HelpVersionList } from "@/components/platform/help-version-list";
import { PlatformButton } from "@/components/platform/platform-button";
import {
  getHelpArticleForAdmin,
  getHelpArticleVersionForAdmin,
  listHelpArticleVersionsForAdmin,
} from "@/lib/help/admin";
import {
  canManageHelpContent,
  canPublishHelp,
  requireHelpPermission,
} from "@/lib/help/permissions";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function HelpVersionsContent({ params, searchParams }: PageProps) {
  const context = await requireHelpPermission(
    "help.versions.read",
    "help.read_drafts",
    "help.console.access",
  );
  const { id } = await params;
  const query = await searchParams;
  const viewId = firstParam(query.view) ?? null;

  const article = await getHelpArticleForAdmin(id);
  if (!article) notFound();

  const versions = await listHelpArticleVersionsForAdmin(id);
  const viewed = viewId
    ? await getHelpArticleVersionForAdmin(viewId)
    : null;

  const canRestore =
    canManageHelpContent(context.permissions) ||
    canPublishHelp(context.permissions);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Version history
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {article.title} · {article.slug}
          </p>
        </div>
        <PlatformButton variant="outline" asChild>
          <Link href={`/platform/help/articles/${id}`}>Back to editor</Link>
        </PlatformButton>
      </div>

      <p className="text-sm text-slate-400">
        Restoring a version copies it into the working draft. The live published
        version stays unchanged until you publish again.
      </p>

      <HelpVersionList
        articleId={id}
        versions={versions}
        canRestore={canRestore}
      />

      {viewed && viewed.article_id === id ? (
        <section className="space-y-3 rounded-lg border border-slate-800 p-4">
          <h2 className="text-lg font-semibold">
            Preview v{viewed.version_number}
          </h2>
          {viewed.change_summary ? (
            <p className="text-sm text-slate-400">{viewed.change_summary}</p>
          ) : null}
          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-200">{viewed.title}</p>
            {viewed.summary ? (
              <p className="text-slate-400">{viewed.summary}</p>
            ) : null}
            <pre className="whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950/50 p-3 text-slate-300">
              {viewed.body_content || "(empty body)"}
            </pre>
            {viewed.steps.length > 0 ? (
              <ol className="list-decimal space-y-2 pl-5 text-slate-300">
                {viewed.steps.map((step) => (
                  <li key={`${step.step_number}-${step.title}`}>
                    <span className="font-medium">{step.title}</span>
                    <div className="text-slate-400">{step.instruction}</div>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function HelpVersionsPage(props: PageProps) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading versions…</div>}>
      <HelpVersionsContentWrapper {...props} />
    </Suspense>
  );
}

async function HelpVersionsContentWrapper(props: PageProps) {
  try {
    return await HelpVersionsContent(props);
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
    throw error;
  }
}
