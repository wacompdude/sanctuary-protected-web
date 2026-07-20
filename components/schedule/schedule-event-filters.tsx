"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SCHEDULE_EVENT_STATUSES,
  SCHEDULE_EVENT_TYPES,
} from "@/lib/schedule/constants";
import type { CampusOption } from "@/lib/schedule/types";

export function ScheduleEventFilters({
  campuses,
}: {
  campuses: CampusOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function submit(formData: FormData) {
    const params = new URLSearchParams();
    for (const key of ["q", "type", "status", "campus"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    startTransition(() => {
      router.push(`/schedule/events?${params.toString()}`);
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="q">
          Search
        </label>
        <Input
          id="q"
          name="q"
          placeholder="Event title"
          defaultValue={searchParams.get("q") ?? ""}
          className="sm:w-56"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="type">
          Type
        </label>
        <select
          id="type"
          name="type"
          className="flex h-10 min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={searchParams.get("type") ?? ""}
        >
          <option value="">All types</option>
          {SCHEDULE_EVENT_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          className="flex h-10 min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={searchParams.get("status") ?? ""}
        >
          <option value="">All statuses</option>
          {SCHEDULE_EVENT_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="campus">
          Campus
        </label>
        <select
          id="campus"
          name="campus"
          className="flex h-10 min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm"
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
      <div className="flex gap-2">
        <Button type="submit">Filter</Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/schedule/events">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
