"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Hover/focus tooltip that portals to document.body so overflow-y on the
 * sidebar nav cannot clip locked-feature messages.
 */
export function NavLockTooltip({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  function place() {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 256;
    const left = Math.min(rect.right + 8, window.innerWidth - width - 8);
    setCoords({
      top: Math.max(8, rect.top),
      left: Math.max(8, left),
    });
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const nav = wrapRef.current?.closest("[data-sidebar-nav]");
    nav?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      nav?.removeEventListener("scroll", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="min-w-0"
      onMouseEnter={() => {
        place();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => {
        place();
        setOpen(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      {children}
      {open
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[60] hidden max-w-64 rounded-md border border-border bg-popover p-2 text-xs font-normal text-popover-foreground shadow-md md:block"
              style={{ top: coords.top, left: coords.left }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
