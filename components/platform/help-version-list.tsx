import Link from "next/link";
import { restoreHelpArticleVersionAction } from "@/app/platform/help-actions";
import { PlatformButton } from "@/components/platform/platform-button";
import type { HelpArticleVersionSummary } from "@/lib/help/admin";

export function HelpVersionList({
  articleId,
  versions,
  canRestore,
}: {
  articleId: string;
  versions: HelpArticleVersionSummary[];
  canRestore: boolean;
}) {
  if (versions.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No published versions yet. Publish the article to create version history.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Version</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Published</th>
            <th className="px-3 py-2 font-medium">Change summary</th>
            <th className="px-3 py-2 font-medium">Steps</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.id} className="border-t border-slate-800">
              <td className="px-3 py-2 tabular-nums">
                v{version.version_number}
                {version.is_current_published ? (
                  <span className="ml-2 text-xs text-emerald-400">live</span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{version.title}</div>
                {version.summary ? (
                  <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                    {version.summary}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-slate-400">
                {new Date(version.published_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-slate-400">
                {version.change_summary || "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-slate-400">
                {version.step_count}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-2">
                  <PlatformButton variant="ghost" size="sm" asChild>
                    <Link
                      href={`/platform/help/articles/${articleId}/versions?view=${version.id}`}
                    >
                      View
                    </Link>
                  </PlatformButton>
                  {canRestore ? (
                    <form action={restoreHelpArticleVersionAction}>
                      <input type="hidden" name="article_id" value={articleId} />
                      <input type="hidden" name="version_id" value={version.id} />
                      <PlatformButton type="submit" size="sm" variant="outline">
                        Restore to draft
                      </PlatformButton>
                    </form>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
