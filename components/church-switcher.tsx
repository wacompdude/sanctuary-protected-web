"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { switchActiveChurch } from "@/app/(app)/church/actions";
import type { ActionState } from "@/lib/church/types";
import { cn } from "@/lib/utils";

export type ChurchOption = {
  id: string;
  name: string;
  role: string;
};

const initialState: ActionState = {};

export function ChurchSwitcher({
  churches,
  activeChurchId,
  collapsed = false,
  className,
}: {
  churches: ChurchOption[];
  activeChurchId: string;
  collapsed?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    switchActiveChurch,
    initialState,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (churches.length <= 1) {
    const only = churches[0];
    if (!only) return null;

    if (collapsed) {
      return (
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md bg-muted/60 text-muted-foreground",
            className,
          )}
          title={only.name}
          aria-label={only.name}
        >
          <Building2 className="h-4 w-4" />
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm",
          className,
        )}
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{only.name}</span>
      </div>
    );
  }

  if (collapsed) {
    return (
      <form
        action={(formData) => {
          startTransition(() => {
            formAction(formData);
          });
        }}
        className={cn("w-full", className)}
      >
        <label className="sr-only" htmlFor="church-switcher-collapsed">
          Switch church
        </label>
        <div className="relative flex justify-center">
          <Building2 className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
          <select
            id="church-switcher-collapsed"
            name="church_id"
            defaultValue={activeChurchId}
            disabled={pending || isPending}
            onChange={(event) => {
              event.currentTarget.form?.requestSubmit();
            }}
            className="h-10 w-10 cursor-pointer appearance-none rounded-md border border-border bg-transparent opacity-0"
            title="Switch church"
            aria-label="Switch church"
          >
            {churches.map((church) => (
              <option key={church.id} value={church.id}>
                {church.name}
              </option>
            ))}
          </select>
        </div>
      </form>
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
      <label className="sr-only" htmlFor="church-switcher">
        Active church
      </label>
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <select
          id="church-switcher"
          key={activeChurchId}
          name="church_id"
          defaultValue={activeChurchId}
          disabled={pending || isPending}
          onChange={(event) => {
            event.currentTarget.form?.requestSubmit();
          }}
          className="h-10 w-full cursor-pointer appearance-none rounded-md border border-border bg-background py-2 pl-9 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {churches.map((church) => (
            <option key={church.id} value={church.id}>
              {church.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {state.error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
