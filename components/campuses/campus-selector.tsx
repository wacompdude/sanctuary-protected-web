"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ChevronDown } from "lucide-react";
import { setActiveCampusFilterAction } from "@/app/(app)/campuses/filter-actions";
import type { ActionState } from "@/lib/church/types";
import { CAMPUS_FILTER_ALL } from "@/lib/campuses/constants";
import { cn } from "@/lib/utils";

export type CampusSelectorOption = {
  id: string;
  name: string;
  short_name?: string | null;
  is_primary?: boolean;
};

const initialState: ActionState = {};

/**
 * Global campus filter control. Default selection is All Campuses.
 * Mobile-first: full-width select with large tap target.
 */
export function CampusSelector({
  campuses,
  activeCampusId,
  tablesAvailable = true,
  className,
  id = "campus-filter",
}: {
  campuses: CampusSelectorOption[];
  /** `null` / omitted = All Campuses */
  activeCampusId: string | null;
  tablesAvailable?: boolean;
  className?: string;
  id?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setActiveCampusFilterAction,
    initialState,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const selectedValue = activeCampusId ?? CAMPUS_FILTER_ALL;
  const busy = pending || isPending;

  if (!tablesAvailable) {
    return (
      <div
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
        title="Apply migration 036 to enable campus filtering"
      >
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="truncate">All Campuses</span>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(() => {
          formAction(formData);
        });
      }}
      className={cn("w-full", className)}
    >
      <label className="sr-only" htmlFor={id}>
        Campus filter
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <select
          id={id}
          key={selectedValue}
          name="campus_id"
          defaultValue={selectedValue}
          disabled={busy}
          onChange={(event) => {
            event.currentTarget.form?.requestSubmit();
          }}
          className="min-h-11 w-full cursor-pointer appearance-none rounded-md border border-border bg-background py-2 pl-9 pr-8 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10 md:min-h-0 md:text-sm"
          aria-busy={busy}
        >
          <option value={CAMPUS_FILTER_ALL}>All Campuses</option>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
              {campus.is_primary ? " (Primary)" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {state.error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
