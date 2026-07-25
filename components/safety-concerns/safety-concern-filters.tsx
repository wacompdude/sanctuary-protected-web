"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SAFETY_CONCERN_PROFILE_STATUSES,
  SAFETY_CONCERN_RESTRICTION_TYPES,
} from "@/lib/safety-concerns/constants";

export type SafetyConcernFilterCampus = {
  id: string;
  name: string;
};

export function SafetyConcernFilters({
  campuses,
  canManage,
  view,
}: {
  campuses: SafetyConcernFilterCampus[];
  canManage: boolean;
  view: "browse" | "list";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function submit(formData: FormData) {
    const params = new URLSearchParams();
    params.set("view", view);
    for (const key of ["q", "status", "restriction", "campus", "incident"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    if (formData.get("reviewDue") === "1") {
      params.set("reviewDue", "1");
    }
    startTransition(() => {
      router.push(`/safety-concerns?${params.toString()}`);
    });
  }

  const statusOptions = canManage
    ? SAFETY_CONCERN_PROFILE_STATUSES
    : SAFETY_CONCERN_PROFILE_STATUSES.filter((item) =>
        ["active", "under_review", "expired"].includes(item.value),
      );

  return (
    <form
      action={submit}
      className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="q">
          Name or alias
        </label>
        <Input
          id="q"
          name="q"
          placeholder="Search authorized profiles"
          defaultValue={searchParams.get("q") ?? ""}
          className="lg:w-56"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="status"
        >
          Status
        </label>
        <select
          id="status"
          name="status"
          className="flex h-11 min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm md:h-9"
          defaultValue={searchParams.get("status") ?? ""}
        >
          <option value="">Browse set</option>
          {statusOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="restriction"
        >
          Restriction
        </label>
        <select
          id="restriction"
          name="restriction"
          className="flex h-11 min-w-[12rem] rounded-md border border-input bg-background px-3 text-sm md:h-9"
          defaultValue={searchParams.get("restriction") ?? ""}
        >
          <option value="">All restrictions</option>
          {SAFETY_CONCERN_RESTRICTION_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="campus"
        >
          Campus
        </label>
        <select
          id="campus"
          name="campus"
          className="flex h-11 min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm md:h-9"
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
      <div className="space-y-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="incident"
        >
          Related incident ID
        </label>
        <Input
          id="incident"
          name="incident"
          placeholder="UUID (optional)"
          defaultValue={searchParams.get("incident") ?? ""}
          className="lg:w-56"
          autoComplete="off"
        />
      </div>
      <label className="flex h-11 items-center gap-2 text-sm md:h-9">
        <input
          type="checkbox"
          name="reviewDue"
          value="1"
          defaultChecked={searchParams.get("reviewDue") === "1"}
          className="size-4 rounded border"
        />
        Review due
      </label>
      <div className="flex gap-2">
        <Button type="submit">Filter</Button>
        <Button type="button" variant="outline" asChild>
          <Link href={`/safety-concerns?view=${view}`}>Clear</Link>
        </Button>
      </div>
    </form>
  );
}
