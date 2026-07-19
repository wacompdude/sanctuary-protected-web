import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  POLICY_DOCUMENT_STATUSES,
  POLICY_DOCUMENT_TYPES,
} from "@/lib/policies/constants";
import type { PolicyCategory } from "@/lib/policies/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PolicyManageFilters({
  categories,
  campuses,
  values,
}: {
  categories: PolicyCategory[];
  campuses: { id: string; name: string }[];
  values: {
    q?: string;
    status?: string;
    type?: string;
    category?: string;
    campus?: string;
    archived?: boolean;
  };
}) {
  return (
    <form className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-6">
      <div className="md:col-span-2">
        <Input
          name="q"
          placeholder="Search title or summary"
          defaultValue={values.q ?? ""}
        />
      </div>
      <select
        name="status"
        defaultValue={values.status ?? ""}
        className={selectClassName}
      >
        <option value="">All statuses</option>
        {POLICY_DOCUMENT_STATUSES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        name="type"
        defaultValue={values.type ?? ""}
        className={selectClassName}
      >
        <option value="">All types</option>
        {POLICY_DOCUMENT_TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        name="category"
        defaultValue={values.category ?? ""}
        className={selectClassName}
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.label}
          </option>
        ))}
      </select>
      <select
        name="campus"
        defaultValue={values.campus ?? ""}
        className={selectClassName}
      >
        <option value="">All campuses</option>
        {campuses.map((campus) => (
          <option key={campus.id} value={campus.id}>
            {campus.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input
          type="checkbox"
          name="archived"
          value="1"
          defaultChecked={values.archived}
        />
        Include archived
      </label>
      <div className="flex flex-wrap gap-2 md:col-span-4 md:justify-end">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" asChild>
          <Link href="/policies/manage">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
