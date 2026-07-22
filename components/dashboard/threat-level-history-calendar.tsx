"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatThreatWeek,
  labelForThreatLevel,
  startOfThreatWeek,
  threatLevelBadgeClassName,
  threatLevelBadgeStyle,
  threatLevelFillColor,
  type ChurchThreatLevelHistoryEntry,
} from "@/lib/church/threat-levels";
import { formatDateTime } from "@/lib/incidents/format";
import { resolveChurchTimeZone } from "@/lib/datetime/format";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function churchLocalYmd(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function buildMonthGrid(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const mondayOffset = (first.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

export function ThreatLevelHistoryCalendar({
  entries,
  timeZone,
}: {
  entries: ChurchThreatLevelHistoryEntry[];
  timeZone: string;
}) {
  const tz = resolveChurchTimeZone(timeZone);
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));

  const latestByWeekStart = useMemo(() => {
    const map = new Map<string, ChurchThreatLevelHistoryEntry>();
    for (const entry of entries) {
      const existing = map.get(entry.week_start);
      if (
        !existing ||
        new Date(entry.created_at).getTime() >
          new Date(existing.created_at).getTime()
      ) {
        map.set(entry.week_start, entry);
      }
    }
    return map;
  }, [entries]);

  const changesByDay = useMemo(() => {
    const map = new Map<string, ChurchThreatLevelHistoryEntry[]>();
    for (const entry of entries) {
      const key = churchLocalYmd(entry.created_at, tz);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return map;
  }, [entries, tz]);

  const monthGrid = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const monthLabel = anchor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const monthChanges = useMemo(() => {
    const start = startOfMonth(anchor);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const startKey = ymdLocal(start);
    const endKey = ymdLocal(end);
    return entries
      .filter((entry) => {
        const key = churchLocalYmd(entry.created_at, tz);
        return key >= startKey && key <= endKey;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }, [anchor, entries, tz]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => setAnchor((current) => addMonths(current, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="text-lg font-semibold">{monthLabel}</p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => setAnchor(startOfMonth(new Date()))}
          >
            This month
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => setAnchor((current) => addMonths(current, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="grid min-w-[640px] grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-2">
              {label}
            </div>
          ))}
        </div>
        <div className="grid min-w-[640px] grid-cols-7">
          {monthGrid.map((day) => {
            const inMonth = day.getMonth() === anchor.getMonth();
            const dayKey = ymdLocal(day);
            const weekKey = startOfThreatWeek(day);
            const weekLevel = latestByWeekStart.get(weekKey);
            const dayChanges = changesByDay.get(dayKey) ?? [];
            const fill = weekLevel
              ? threatLevelFillColor(weekLevel.threat_level)
              : undefined;

            return (
              <div
                key={dayKey}
                className={cn(
                  "min-h-[110px] border-b border-r border-border p-2",
                  !inMonth && "bg-muted/20 text-muted-foreground",
                )}
                style={
                  inMonth && fill
                    ? { backgroundColor: `${fill}55` }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-medium">{day.getDate()}</span>
                  {weekLevel && dayKey === weekKey ? (
                    <span
                      className={cn(
                        threatLevelBadgeClassName(weekLevel.threat_level),
                        "px-1.5 py-0 text-[10px]",
                      )}
                      style={threatLevelBadgeStyle(weekLevel.threat_level)}
                    >
                      {labelForThreatLevel(weekLevel.threat_level)}
                    </span>
                  ) : null}
                </div>
                {dayChanges.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {dayChanges.slice(0, 3).map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded border border-border/60 bg-background/80 px-1.5 py-1 text-[11px] leading-tight"
                      >
                        <span className="font-semibold">
                          {labelForThreatLevel(entry.threat_level)}
                        </span>
                        <span className="block text-muted-foreground">
                          Changed
                        </span>
                      </li>
                    ))}
                    {dayChanges.length > 3 ? (
                      <li className="text-[11px] text-muted-foreground">
                        +{dayChanges.length - 3} more
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Changes this month</CardTitle>
          <CardDescription>
            {monthChanges.length === 0
              ? "No threat level changes recorded in this month."
              : `${monthChanges.length} change${monthChanges.length === 1 ? "" : "s"} recorded.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthChanges.length === 0 ? null : (
            <ul className="space-y-3">
              {monthChanges.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-border px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={threatLevelBadgeClassName(entry.threat_level)}
                      style={threatLevelBadgeStyle(entry.threat_level)}
                    >
                      {labelForThreatLevel(entry.threat_level)}
                    </span>
                    <p className="text-sm font-medium">
                      Week of {formatThreatWeek(entry.week_start, tz)}
                    </p>
                  </div>
                  {entry.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                      {entry.notes}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-muted-foreground">
                    Changed by {entry.changed_by_name} on{" "}
                    {formatDateTime(entry.created_at, null, tz)}.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Day tint shows the latest recorded level for that threat week. Change
        markers appear on the day the level was saved.
      </p>
    </div>
  );
}
