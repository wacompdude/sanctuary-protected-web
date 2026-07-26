"use client";

import { useActionState } from "react";
import {
  createHelpCategoryAction,
  updateHelpCategoryAction,
} from "@/app/platform/help-actions";
import { PlatformButton } from "@/components/platform/platform-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HELP_CATEGORY_STATUSES } from "@/lib/help/constants";
import type { HelpActionState, HelpCategory } from "@/lib/help/types";

const initialState: HelpActionState = {};

export function HelpCategoryForm({
  category,
  categories,
}: {
  category?: HelpCategory | null;
  categories: HelpCategory[];
}) {
  const action = category ? updateHelpCategoryAction : createHelpCategoryAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      {category ? (
        <input type="hidden" name="category_id" value={category.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="help-cat-name">Name</Label>
          <Input
            id="help-cat-name"
            name="name"
            defaultValue={category?.name ?? ""}
            required
            className="border-slate-700 bg-slate-900"
          />
          {state.fieldErrors?.name ? (
            <p className="text-xs text-rose-400">{state.fieldErrors.name}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-cat-slug">Slug</Label>
          <Input
            id="help-cat-slug"
            name="slug"
            defaultValue={category?.slug ?? ""}
            placeholder="auto from name if blank"
            className="border-slate-700 bg-slate-900 font-mono text-sm"
          />
          {state.fieldErrors?.slug ? (
            <p className="text-xs text-rose-400">{state.fieldErrors.slug}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-cat-description">Description</Label>
        <textarea
          id="help-cat-description"
          name="description"
          rows={2}
          defaultValue={category?.description ?? ""}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="help-cat-parent">Parent</Label>
          <select
            id="help-cat-parent"
            name="parent_category_id"
            defaultValue={category?.parent_category_id ?? ""}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            <option value="">None (top-level)</option>
            {categories
              .filter((item) => item.id !== category?.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-cat-order">Display order</Label>
          <Input
            id="help-cat-order"
            name="display_order"
            type="number"
            min={0}
            defaultValue={category?.display_order ?? 0}
            className="border-slate-700 bg-slate-900"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="help-cat-status">Status</Label>
          <select
            id="help-cat-status"
            name="status"
            defaultValue={category?.status ?? "active"}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
          >
            {HELP_CATEGORY_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="help-cat-icon">Icon key (optional)</Label>
        <Input
          id="help-cat-icon"
          name="icon"
          defaultValue={category?.icon ?? ""}
          className="border-slate-700 bg-slate-900"
        />
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
        {pending ? "Saving…" : category ? "Update category" : "Create category"}
      </PlatformButton>
    </form>
  );
}
