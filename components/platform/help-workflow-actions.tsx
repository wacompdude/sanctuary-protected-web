"use client";

import { useActionState } from "react";
import {
  archiveHelpArticleAction,
  deleteHelpArticleAction,
  publishHelpArticleAction,
  restoreHelpArticleAction,
  submitHelpArticleAction,
} from "@/app/platform/help-actions";
import { HelpDeleteButton } from "@/components/platform/help-delete-button";
import { PlatformButton } from "@/components/platform/platform-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HelpActionState, HelpArticleStatus } from "@/lib/help/types";

const initialState: HelpActionState = {};

export function HelpWorkflowActions({
  articleId,
  articleTitle,
  status,
  canPublish,
  canArchive,
  canUpdate,
  canDelete,
  publishedSlug,
}: {
  articleId: string;
  articleTitle: string;
  status: HelpArticleStatus;
  canPublish: boolean;
  canArchive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  publishedSlug?: string | null;
}) {
  const [publishState, publishAction, publishing] = useActionState(
    publishHelpArticleAction,
    initialState,
  );

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <div>
        <h2 className="text-lg font-semibold">Workflow</h2>
        <p className="text-sm text-slate-400">
          Current status:{" "}
          <span className="font-medium text-slate-200">{status}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canUpdate && (status === "draft" || status === "published") ? (
          <form action={submitHelpArticleAction}>
            <input type="hidden" name="article_id" value={articleId} />
            <PlatformButton type="submit" variant="outline" size="sm">
              Submit for review
            </PlatformButton>
          </form>
        ) : null}

        {canArchive && status !== "archived" ? (
          <form action={archiveHelpArticleAction}>
            <input type="hidden" name="article_id" value={articleId} />
            <PlatformButton type="submit" variant="outline" size="sm">
              Archive
            </PlatformButton>
          </form>
        ) : null}

        {canUpdate && status === "archived" ? (
          <form action={restoreHelpArticleAction}>
            <input type="hidden" name="article_id" value={articleId} />
            <PlatformButton type="submit" variant="outline" size="sm">
              Restore to draft
            </PlatformButton>
          </form>
        ) : null}

        {status === "published" && publishedSlug ? (
          <PlatformButton variant="ghost" size="sm" asChild>
            <a href={`/help/article/${publishedSlug}`} target="_blank" rel="noreferrer">
              Preview live
            </a>
          </PlatformButton>
        ) : null}

        {canDelete ? (
          <HelpDeleteButton
            action={deleteHelpArticleAction}
            confirmMessage={`Permanently delete “${articleTitle}”? Versions, steps, and feedback for this article will also be removed. This cannot be undone.`}
            hiddenFields={{ article_id: articleId }}
          />
        ) : null}
      </div>

      {canPublish && status !== "archived" ? (
        <form action={publishAction} className="space-y-3 border-t border-slate-800 pt-4">
          <input type="hidden" name="article_id" value={articleId} />
          <div className="space-y-2">
            <Label htmlFor="help-publish-summary">Change summary</Label>
            <Input
              id="help-publish-summary"
              name="change_summary"
              placeholder="What changed in this version?"
              className="border-slate-700 bg-slate-900"
            />
          </div>
          {publishState.error ? (
            <p className="text-sm text-rose-400">{publishState.error}</p>
          ) : null}
          {publishState.success ? (
            <p className="text-sm text-emerald-400">{publishState.success}</p>
          ) : null}
          <PlatformButton type="submit" disabled={publishing}>
            {publishing ? "Publishing…" : "Publish version"}
          </PlatformButton>
        </form>
      ) : null}
    </div>
  );
}
