"use client";

import { useMemo } from "react";
import {
  THREAT_LEVEL_OPTIONS,
  labelForThreatLevel,
  threatLevelFillColor,
  type ChurchThreatLevelHistoryEntry,
  type ThreatLevel,
} from "@/lib/church/threat-levels";

type Slice = {
  level: ThreatLevel;
  label: string;
  count: number;
  percent: number;
  color: string;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

export function ThreatLevelFrequencyChart({
  entries,
}: {
  entries: ChurchThreatLevelHistoryEntry[];
}) {
  const slices = useMemo(() => {
    const counts = new Map<ThreatLevel, number>();
    for (const option of THREAT_LEVEL_OPTIONS) {
      counts.set(option.value, 0);
    }
    for (const entry of entries) {
      counts.set(entry.threat_level, (counts.get(entry.threat_level) ?? 0) + 1);
    }

    const total = entries.length;
    return THREAT_LEVEL_OPTIONS.map((option) => {
      const count = counts.get(option.value) ?? 0;
      return {
        level: option.value,
        label: labelForThreatLevel(option.value),
        count,
        percent: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
        color: threatLevelFillColor(option.value),
      } satisfies Slice;
    });
  }, [entries]);

  const total = entries.length;
  const activeSlices = slices.filter((slice) => slice.count > 0);

  let angle = 0;
  const arcs =
    activeSlices.length === 1
      ? [
          {
            ...activeSlices[0],
            path: undefined as string | undefined,
            fullCircle: true,
          },
        ]
      : activeSlices.map((slice) => {
          const sweep = (slice.count / total) * 360;
          const startAngle = angle;
          const endAngle = angle + sweep;
          angle = endAngle;
          return {
            ...slice,
            path: describeArc(100, 100, 90, startAngle, endAngle),
            fullCircle: false,
          };
        });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-center">
      <div className="mx-auto w-full max-w-[280px]">
        {total === 0 ? (
          <div className="flex aspect-square items-center justify-center rounded-full border border-dashed border-border text-sm text-muted-foreground">
            No data yet
          </div>
        ) : (
          <svg viewBox="0 0 200 200" className="h-auto w-full" role="img">
            <title>Threat level frequency pie chart</title>
            {arcs.map((arc) =>
              arc.fullCircle ? (
                <circle
                  key={arc.level}
                  cx="100"
                  cy="100"
                  r="90"
                  fill={arc.color}
                  stroke="#111111"
                  strokeWidth="1"
                />
              ) : (
                <path
                  key={arc.level}
                  d={arc.path}
                  fill={arc.color}
                  stroke="#111111"
                  strokeWidth="1"
                />
              ),
            )}
          </svg>
        )}
      </div>

      <ul className="space-y-2">
        {slices.map((slice) => (
          <li
            key={slice.level}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-4 w-4 rounded-sm border border-border"
                style={{ backgroundColor: slice.color }}
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium">{slice.label}</p>
                <p className="text-xs text-muted-foreground">
                  {slice.percent}% of recorded changes
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold tabular-nums">{slice.count}</p>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3 pt-1 text-sm text-muted-foreground">
          <span>Total changes</span>
          <span className="font-semibold tabular-nums text-foreground">
            {total}
          </span>
        </li>
      </ul>
    </div>
  );
}
