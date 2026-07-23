"use client";

import type { CSSProperties } from "react";

export function DashboardBoxPreviewTile({
  title,
  description,
  backgroundColor,
  textColor,
  mutedTextColor,
  sampleValue = "12",
  hidden,
}: {
  title: string;
  description: string;
  backgroundColor: string;
  textColor: string;
  mutedTextColor?: string;
  sampleValue?: string;
  hidden?: boolean;
}) {
  const style: CSSProperties = {
    backgroundColor,
    color: textColor,
    borderColor: textColor === "#FFFFFF" ? "rgba(255,255,255,0.35)" : "rgba(17,24,39,0.15)",
    borderStyle: "solid",
    borderWidth: "1px",
    opacity: hidden ? 0.55 : 1,
  };

  return (
    <div
      className="rounded-lg p-3 shadow-sm"
      style={style}
      aria-hidden={hidden ? true : undefined}
    >
      <p className="text-2xl font-semibold tabular-nums leading-none">{sampleValue}</p>
      <p className="mt-2 text-sm font-medium leading-snug">{title}</p>
      <p
        className="mt-1 text-xs leading-snug"
        style={{ color: mutedTextColor ?? textColor, opacity: 0.75 }}
      >
        {description}
      </p>
      {hidden ? (
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wide opacity-80">
          Hidden on dashboard
        </p>
      ) : null}
    </div>
  );
}
