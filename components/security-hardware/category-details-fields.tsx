"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  detailTableForCategory,
  fieldsForCategory,
  titleForDetailTable,
  type CategoryDetailRecord,
} from "@/lib/security-hardware/category-details";
import type { EquipmentCategory } from "@/lib/security-hardware/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function dateValue(value: string | number | boolean | null | undefined): string {
  if (value == null || value === "") return "";
  return String(value).slice(0, 10);
}

export function CategoryDetailsFields({
  category,
  values,
}: {
  category: EquipmentCategory;
  values?: CategoryDetailRecord | null;
}) {
  const table = detailTableForCategory(category);
  const fields = fieldsForCategory(category);

  if (!table || fields.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>4. Technical details</CardTitle>
          <CardDescription>
            No category-specific technical fields for this equipment type.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Technical details</CardTitle>
        <CardDescription>
          {titleForDetailTable(table)}. Fields update when you change the
          category above. Never store passwords, codes, or encryption keys.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const name = `detail_${field.key}`;
          const current = values?.[field.key];

          if (field.kind === "boolean") {
            return (
              <label
                key={field.key}
                className="flex items-start gap-2 text-sm sm:col-span-2"
              >
                <input
                  type="checkbox"
                  name={name}
                  value="on"
                  className="mt-1"
                  defaultChecked={Boolean(current)}
                />
                <span>
                  <span className="font-medium">{field.label}</span>
                  {field.hint && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {field.hint}
                    </span>
                  )}
                </span>
              </label>
            );
          }

          if (field.kind === "textarea") {
            return (
              <div key={field.key} className="space-y-2 sm:col-span-2">
                <Label htmlFor={name}>{field.label}</Label>
                <textarea
                  id={name}
                  name={name}
                  className={textareaClassName}
                  defaultValue={current != null ? String(current) : ""}
                />
                {field.hint && (
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                )}
              </div>
            );
          }

          if (field.kind === "select") {
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={name}>{field.label}</Label>
                <select
                  id={name}
                  name={name}
                  className={selectClassName}
                  defaultValue={current != null ? String(current) : ""}
                >
                  <option value="">Select…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {field.hint && (
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                )}
              </div>
            );
          }

          return (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={name}>{field.label}</Label>
              <Input
                id={name}
                name={name}
                type={
                  field.kind === "number"
                    ? "number"
                    : field.kind === "date"
                      ? "date"
                      : "text"
                }
                defaultValue={
                  field.kind === "date"
                    ? dateValue(current)
                    : current != null
                      ? String(current)
                      : ""
                }
              />
              {field.hint && (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
