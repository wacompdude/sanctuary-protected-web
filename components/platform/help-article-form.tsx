"use client";

import { useActionState } from "react";
import {
  createHelpArticleAction,
  updateHelpArticleAction,
} from "@/app/platform/help-actions";
import { PlatformButton } from "@/components/platform/platform-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HELP_ARTICLE_TYPES,
  HELP_AUDIENCE_SCOPES,
  HELP_BODY_FORMATS,
  HELP_DIFFICULTIES,
} from "@/lib/help/constants";
import type { HelpAdminArticleDetail } from "@/lib/help/admin";
import type { HelpActionState, HelpCategory } from "@/lib/help/types";

const initialState: HelpActionState = {};

export function HelpArticleForm({
  article,
  categories,
}: {
  article?: HelpAdminArticleDetail | null;
  categories: HelpCategory[];
}) {
  const action = article ? updateHelpArticleAction : createHelpArticleAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {article ? (
        <input type="hidden" name="article_id" value={article.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="help-article-title">Title</Label>
          <Input
            id="help-article-title"
            name="title"
            defaultValue={article?.title ?? ""}
            required
            className="border-slate-700 bg-slate-900"
          />
          {state.fieldErrors?.title ? (
            <p className="text-xs text-rose-400">{state.fieldErrors.title}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-slug">Slug</Label>
          <Input
            id="help-article-slug"
            name="slug"
            defaultValue={article?.slug ?? ""}
            className="border-slate-700 bg-slate-900 font-mono text-sm"
          />
          {state.fieldErrors?.slug ? (
            <p className="text-xs text-rose-400">{state.fieldErrors.slug}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-category">Category</Label>
          <select
            id="help-article-category"
            name="category_id"
            defaultValue={article?.category_id ?? ""}
            required
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            <option value="" disabled>
              Select category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.category_id ? (
            <p className="text-xs text-rose-400">
              {state.fieldErrors.category_id}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-article-summary">Summary</Label>
        <textarea
          id="help-article-summary"
          name="summary"
          rows={2}
          defaultValue={article?.summary ?? ""}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-article-body">Body (Markdown)</Label>
        <textarea
          id="help-article-body"
          name="body_content"
          rows={10}
          defaultValue={article?.body_content ?? ""}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="help-article-type">Type</Label>
          <select
            id="help-article-type"
            name="article_type"
            defaultValue={article?.article_type ?? "how_to"}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            {HELP_ARTICLE_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-format">Body format</Label>
          <select
            id="help-article-format"
            name="body_format"
            defaultValue={article?.body_format ?? "markdown"}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            {HELP_BODY_FORMATS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-audience">Audience</Label>
          <select
            id="help-article-audience"
            name="audience_scope"
            defaultValue={article?.audience_scope ?? "all_authenticated"}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            {HELP_AUDIENCE_SCOPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-difficulty">Difficulty</Label>
          <select
            id="help-article-difficulty"
            name="difficulty"
            defaultValue={article?.difficulty ?? ""}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            <option value="">None</option>
            {HELP_DIFFICULTIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="help-article-minutes">Estimated minutes</Label>
          <Input
            id="help-article-minutes"
            name="estimated_minutes"
            type="number"
            min={1}
            max={240}
            defaultValue={article?.estimated_minutes ?? ""}
            className="border-slate-700 bg-slate-900"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-order">Display order</Label>
          <Input
            id="help-article-order"
            name="display_order"
            type="number"
            min={0}
            defaultValue={article?.display_order ?? 0}
            className="border-slate-700 bg-slate-900"
          />
        </div>
        <div className="flex items-end gap-4 pb-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_featured"
              value="true"
              defaultChecked={article?.is_featured}
            />
            Featured
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_popular"
              value="true"
              defaultChecked={article?.is_popular}
            />
            Popular
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="help-article-keywords">Search keywords</Label>
          <textarea
            id="help-article-keywords"
            name="search_keywords"
            rows={2}
            defaultValue={(article?.search_keywords ?? []).join(", ")}
            placeholder="comma or newline separated"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-context">Context keys</Label>
          <textarea
            id="help-article-context"
            name="context_keys"
            rows={2}
            defaultValue={(article?.context_keys ?? []).join(", ")}
            placeholder="events.create, incidents.photos.upload"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-features">Feature keys</Label>
          <textarea
            id="help-article-features"
            name="feature_keys"
            rows={2}
            defaultValue={(article?.feature_keys ?? []).join(", ")}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-plans">Plan keys</Label>
          <textarea
            id="help-article-plans"
            name="plan_keys"
            rows={2}
            defaultValue={(article?.plan_keys ?? []).join(", ")}
            placeholder="steward_pro, shepherd_plus"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-roles">Role keys</Label>
          <textarea
            id="help-article-roles"
            name="role_keys"
            rows={2}
            defaultValue={(article?.role_keys ?? []).join(", ")}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-prereqs">Prerequisites</Label>
          <textarea
            id="help-article-prereqs"
            name="prerequisites"
            rows={2}
            defaultValue={(article?.prerequisites ?? []).join("\n")}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-article-expected">Expected result</Label>
        <textarea
          id="help-article-expected"
          name="expected_result"
          rows={2}
          defaultValue={article?.expected_result ?? ""}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="help-article-cta-label">Support CTA label</Label>
          <Input
            id="help-article-cta-label"
            name="support_cta_label"
            defaultValue={article?.support_cta_label ?? ""}
            className="border-slate-700 bg-slate-900"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-article-cta-path">Support CTA path</Label>
          <Input
            id="help-article-cta-path"
            name="support_cta_path"
            defaultValue={article?.support_cta_path ?? ""}
            placeholder="/help"
            className="border-slate-700 bg-slate-900"
          />
          {state.fieldErrors?.support_cta_path ? (
            <p className="text-xs text-rose-400">
              {state.fieldErrors.support_cta_path}
            </p>
          ) : null}
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-rose-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-400" role="status">
          {state.success}
        </p>
      ) : null}

      <PlatformButton type="submit" disabled={pending}>
        {pending ? "Saving…" : article ? "Save article" : "Create draft"}
      </PlatformButton>
    </form>
  );
}
