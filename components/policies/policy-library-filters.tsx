"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POLICY_DOCUMENT_TYPES } from "@/lib/policies/constants";
import type { PolicyCategory } from "@/lib/policies/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PolicyLibraryFilters({
  categories,
  campuses,
}: {
  categories: PolicyCategory[];
  campuses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`/policies?${params.toString()}`);
    });
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        update({
          q: String(form.get("q") ?? "").trim() || null,
          type: String(form.get("type") ?? "") || null,
          category: String(form.get("category") ?? "") || null,
          campus: String(form.get("campus") ?? "") || null,
          emergency: form.get("emergency") === "on" ? "1" : null,
          ack: form.get("ack") === "on" ? "1" : null,
        });
      }}
    >
      <div className="space-y-2 md:col-span-2 xl:col-span-2">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Title, summary, or keywords"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Document type</Label>
        <select
          id="type"
          name="type"
          className={selectClassName}
          defaultValue={searchParams.get("type") ?? ""}
        >
          <option value="">All types</option>
          {POLICY_DOCUMENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          className={selectClassName}
          defaultValue={searchParams.get("category") ?? ""}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="campus">Campus</Label>
        <select
          id="campus"
          name="campus"
          className={selectClassName}
          defaultValue={searchParams.get("campus") ?? ""}
        >
          <option value="">All campuses</option>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-4 md:col-span-2 xl:col-span-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="emergency"
            defaultChecked={searchParams.get("emergency") === "1"}
          />
          Emergency only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="ack"
            defaultChecked={searchParams.get("ack") === "1"}
          />
          Acknowledgment required
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Filtering…" : "Apply filters"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            startTransition(() => router.push("/policies"));
          }}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
