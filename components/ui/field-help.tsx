"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * Accessible field help: click/tap, keyboard, and hover (fine pointers only).
 * Touch devices open on tap; they do not rely on hover.
 */
export function FieldHelp({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const openedByFocusRef = useRef(false);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    openedByFocusRef.current = false;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex shrink-0", className)}
      onMouseEnter={() => {
        if (!isCoarsePointer()) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!isCoarsePointer() && !openedByFocusRef.current) close();
      }}
    >
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tooltipId}
        data-testid={`field-help-${label}`}
        onClick={() => {
          if (openedByFocusRef.current) {
            openedByFocusRef.current = false;
            setOpen(true);
            return;
          }
          setOpen((current) => !current);
        }}
        onFocus={() => {
          openedByFocusRef.current = true;
          setOpen(true);
        }}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) {
            close();
          }
        }}
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(20rem,calc(100vw-2rem))] break-words rounded-md border border-border bg-popover px-3 py-2 text-left text-xs leading-relaxed text-popover-foreground shadow-md"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

export function FieldLabelWithHelp({
  htmlFor,
  label,
  helpLabel,
  help,
}: {
  htmlFor: string;
  label: string;
  helpLabel: string;
  help: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-1">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
      </label>
      <FieldHelp label={helpLabel}>{help}</FieldHelp>
    </div>
  );
}
