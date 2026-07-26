import Link from "next/link";
import { Suspense } from "react";
import { HelpArticleForm } from "@/components/platform/help-article-form";
import { PlatformButton } from "@/components/platform/platform-button";
import { listHelpCategoriesForAdmin } from "@/lib/help/admin";
import { requireHelpPermission } from "@/lib/help/permissions";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";

async function NewHelpArticleContent() {
  await requireHelpPermission("help.create");
  const categories = await listHelpCategoriesForAdmin();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            New help article
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Creates a draft. Add steps and publish when ready.
          </p>
        </div>
        <PlatformButton variant="outline" asChild>
          <Link href="/platform/help">Cancel</Link>
        </PlatformButton>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          Create at least one active category before adding articles.{" "}
          <Link
            href="/platform/help/categories"
            className="underline underline-offset-4"
          >
            Manage categories
          </Link>
        </div>
      ) : (
        <HelpArticleForm categories={categories} />
      )}
    </div>
  );
}

export default function NewHelpArticlePage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
      <NewHelpArticleContentWrapper />
    </Suspense>
  );
}

async function NewHelpArticleContentWrapper() {
  try {
    return await NewHelpArticleContent();
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
    throw error;
  }
}
