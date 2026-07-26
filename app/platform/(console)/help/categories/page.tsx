import Link from "next/link";
import { Suspense } from "react";
import { deleteHelpCategoryAction } from "@/app/platform/help-actions";
import { HelpCategoryForm } from "@/components/platform/help-category-form";
import { HelpDeleteButton } from "@/components/platform/help-delete-button";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { PlatformButton } from "@/components/platform/platform-button";
import { listHelpCategoriesForAdmin } from "@/lib/help/admin";
import {
  canDeleteHelpCategories,
  canManageHelpContent,
  requireHelpPermission,
} from "@/lib/help/permissions";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function HelpCategoriesContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireHelpPermission(
    "help.categories.manage",
    "help.console.access",
    "help.read_drafts",
  );
  const params = await searchParams;
  const editId = firstParam(params.edit) ?? null;

  const categories = await listHelpCategoriesForAdmin({
    includeArchived: true,
  });
  const canManage = canManageHelpContent(context.permissions);
  const canDelete = canDeleteHelpCategories(context.permissions);
  const editing = editId
    ? categories.find((category) => category.id === editId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Help categories
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Organize the customer Help Center topic tree.
          </p>
        </div>
        <PlatformButton variant="outline" asChild>
          <Link href="/platform/help">Back to articles</Link>
        </PlatformButton>
      </div>

      {canManage ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            {editing ? `Edit “${editing.name}”` : "Create category"}
          </h2>
          <HelpCategoryForm category={editing} categories={categories} />
          {editing ? (
            <div className="mt-2">
              <PlatformButton variant="ghost" size="sm" asChild>
                <Link href="/platform/help/categories">Cancel edit</Link>
              </PlatformButton>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-slate-400">
                  No categories yet.
                </td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr key={category.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    <div className="font-medium">{category.name}</div>
                    {category.description ? (
                      <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                        {category.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {category.slug}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {category.display_order}
                  </td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={category.status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      {canManage ? (
                        <PlatformButton variant="ghost" size="sm" asChild>
                          <Link
                            href={`/platform/help/categories?edit=${category.id}`}
                          >
                            Edit
                          </Link>
                        </PlatformButton>
                      ) : null}
                      {canDelete ? (
                        <HelpDeleteButton
                          action={deleteHelpCategoryAction}
                          confirmMessage={`Permanently delete category “${category.name}”? This cannot be undone. Categories with child topics or articles cannot be deleted.`}
                          hiddenFields={{ category_id: category.id }}
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

export default function PlatformHelpCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading categories…</div>}
    >
      <HelpCategoriesContentWrapper searchParams={searchParams} />
    </Suspense>
  );
}

async function HelpCategoriesContentWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return await HelpCategoriesContent({ searchParams });
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
    throw error;
  }
}
