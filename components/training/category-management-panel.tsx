"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createCustomCategory,
  updateCategoryChurchState,
} from "@/app/(app)/training/actions";
import type { TrainingCategoryWithState } from "@/lib/training/types";

function CategoryStateForm({ category }: { category: TrainingCategoryWithState }) {
  const [state, action, pending] = useActionState(
    updateCategoryChurchState.bind(null, category.id),
    {},
  );

  if (!category.is_system) return null;

  return (
    <form action={action} className="mt-3 space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Church override
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="true" defaultChecked={category.effective_active} />
        Active for this church
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_required"
          value="true"
          defaultChecked={category.effective_is_required}
        />
        Required
      </label>
      <div className="space-y-1">
        <Label htmlFor={`order-${category.id}`}>Display order</Label>
        <Input
          id={`order-${category.id}`}
          name="display_order"
          type="number"
          defaultValue={category.effective_display_order}
        />
      </div>
      {state.success ? (
        <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Save override
      </Button>
    </form>
  );
}

export function CategoryManagementPanel({
  categories,
}: {
  categories: TrainingCategoryWithState[];
}) {
  const [state, action, pending] = useActionState(createCustomCategory, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Create custom category</p>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.success ? (
            <p className="text-sm text-green-600 dark:text-green-400">{state.success}</p>
          ) : null}
          <Input name="name" placeholder="Category name" required />
          <textarea
            name="description"
            placeholder="Description"
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" disabled={pending}>
            Add category
          </Button>
        </form>

        <div className="max-h-80 space-y-3 overflow-y-auto">
          {categories.map((category) => (
            <div key={category.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{category.name}</p>
              {category.is_system ? (
                <p className="text-xs text-muted-foreground">System category</p>
              ) : (
                <p className="text-xs text-muted-foreground">Custom category</p>
              )}
              <CategoryStateForm category={category} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
