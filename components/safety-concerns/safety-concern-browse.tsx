"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  labelForSafetyConcernEnum,
  SAFETY_CONCERN_PROFILE_STATUSES,
} from "@/lib/safety-concerns/constants";
import type { SafetyConcernBrowseItem } from "@/lib/safety-concerns/types";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD_PX = 48;

export function SafetyConcernBrowse({
  items,
  canManage,
}: {
  items: SafetyConcernBrowseItem[];
  canManage: boolean;
}) {
  const [profileIndex, setProfileIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const total = items.length;
  const safeProfileIndex = total === 0 ? 0 : Math.min(profileIndex, total - 1);
  const current = total > 0 ? items[safeProfileIndex] : null;
  const photos = current?.photos ?? [];
  const safePhotoIndex =
    photos.length === 0 ? 0 : Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[safePhotoIndex] ?? null;
  const multiProfile = total > 1;
  const multiPhoto = photos.length > 1;

  const goProfile = useCallback(
    (delta: number) => {
      if (total <= 1) return;
      setProfileIndex((index) => {
        const next = (index + delta + total) % total;
        return next;
      });
      setPhotoIndex(0);
    },
    [total],
  );

  const goPhoto = useCallback(
    (delta: number) => {
      if (photos.length <= 1) return;
      setPhotoIndex((index) => (index + delta + photos.length) % photos.length);
    },
    [photos.length],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        goProfile(-1);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goProfile(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (multiPhoto) goPhoto(-1);
        else goProfile(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (multiPhoto) goPhoto(1);
        else goProfile(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goPhoto, goProfile, multiPhoto]);

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = event.changedTouches[0]?.clientX;
    if (end == null) return;
    const delta = end - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (multiPhoto) {
      goPhoto(delta < 0 ? 1 : -1);
      return;
    }
    goProfile(delta < 0 ? 1 : -1);
  }

  if (!current) {
    return (
      <div className="rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        No Safety Concern Profiles match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p aria-live="polite">
          Profile {safeProfileIndex + 1} of {total}
          {multiPhoto ? (
            <span className="ml-2 border-l pl-2">
              Photo {safePhotoIndex + 1} of {photos.length}
            </span>
          ) : null}
        </p>
        {canManage ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/safety-concerns/${current.id}`}>
              Open profile
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>

      <div
        className="overflow-hidden rounded-lg border bg-muted/30"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative aspect-[4/3] w-full bg-muted sm:aspect-[16/10]">
          {currentPhoto?.signedUrl ? (
            // Signed URLs are ephemeral; unoptimized avoids Next image cache retention.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPhoto.signedUrl}
              alt={`Photo of ${current.displayName}`}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="h-10 w-10" aria-hidden />
              <p className="text-sm">No photo available</p>
            </div>
          )}

          {multiPhoto ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 shadow"
                onClick={() => goPhoto(-1)}
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 shadow"
                onClick={() => goPhoto(1)}
                aria-label="Next photo"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>

        <div className="space-y-3 border-t bg-background px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {current.displayName}
              </h2>
              {current.aliases ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Also known as: {current.aliases}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border px-2 py-1 text-xs capitalize text-muted-foreground">
                {labelForSafetyConcernEnum(
                  SAFETY_CONCERN_PROFILE_STATUSES,
                  current.status,
                )}
              </span>
              {current.restriction ? (
                <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-950 dark:text-amber-100">
                  {current.restriction.label}
                </span>
              ) : null}
            </div>
          </div>

          {current.campusNames.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Campus: {current.campusNames.join(", ")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Campus: Church-wide</p>
          )}

          {currentPhoto?.contextNote ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Photo note
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {currentPhoto.contextNote}
              </p>
            </div>
          ) : null}

          {current.shortNote ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Short note
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {current.shortNote}
              </p>
            </div>
          ) : null}

          {current.responseGuidance ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Response guidance
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {current.responseGuidance}
              </p>
            </div>
          ) : null}

          {multiProfile ? (
            <div className="flex items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-[7rem]"
                onClick={() => goProfile(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-[7rem]"
                onClick={() => goProfile(1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {multiProfile ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Profiles
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((item, index) => {
              const selected = index === safeProfileIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setProfileIndex(index);
                    setPhotoIndex(0);
                  }}
                  className={cn(
                    "flex w-20 shrink-0 flex-col gap-1 rounded-md border p-1 text-left transition-colors",
                    selected
                      ? "border-primary ring-1 ring-primary"
                      : "hover:bg-muted/60",
                  )}
                  aria-label={`Show profile ${item.displayName}`}
                  aria-current={selected ? "true" : undefined}
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded bg-muted">
                    {item.primaryPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.primaryPhotoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-4 w-4" aria-hidden />
                      </div>
                    )}
                  </div>
                  <span className="truncate text-[11px] font-medium leading-tight">
                    {item.displayName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {multiPhoto
          ? "Swipe the photo or use ← → for photos. Use ↑ ↓ or Previous/Next for profiles."
          : multiProfile
            ? "Swipe or use ← → / Previous / Next to move between profiles."
            : "Single profile in the current browse set."}
      </p>
    </div>
  );
}
