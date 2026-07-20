"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatChurchDate,
  formatChurchDateTime,
  resolveChurchTimeZone,
} from "@/lib/datetime/format";
import {
  labelForScheduleEventStatus,
  labelForScheduleEventType,
  SCHEDULE_EVENT_TYPES,
} from "@/lib/schedule/constants";
import type {
  CampusOption,
  ScheduleCalendarItem,
  ScheduleCalendarView,
} from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

type Props = {
  items: ScheduleCalendarItem[];
  campuses: CampusOption[];
  timeZone: string;
  canManage: boolean;
  tablesAvailable: boolean;
  migrationHint?: string;
  initialView?: ScheduleCalendarView;
  initialAnchor?: string;
};

function startOfWeek(date: Date, weekStartsOn: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function churchParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

function eventTypeBadgeVariant(
  type: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (type === "security_drill") return "destructive";
  if (type === "training" || type === "meeting") return "secondary";
  if (type === "maintenance") return "outline";
  return "default";
}

export function ScheduleCalendar({
  items,
  campuses,
  timeZone,
  canManage,
  tablesAvailable,
  migrationHint,
  initialView = "month",
  initialAnchor,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const tz = resolveChurchTimeZone(timeZone);

  const [view, setView] = useState<ScheduleCalendarView>(initialView);
  const [anchor, setAnchor] = useState(() => {
    if (initialAnchor) {
      const parsed = new Date(`${initialAnchor}T12:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });

  const filters = {
    type: searchParams.get("type") ?? "",
    campus: searchParams.get("campus") ?? "",
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.type && item.event_type !== filters.type) return false;
      if (filters.campus && item.campus_id !== filters.campus) return false;
      return true;
    });
  }, [items, filters.type, filters.campus]);

  function pushFilters(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    startTransition(() => {
      router.push(`/schedule/calendar?${params.toString()}`);
    });
  }

  function shiftAnchor(direction: -1 | 1) {
    setAnchor((current) => {
      const next = new Date(current);
      if (view === "month") next.setMonth(next.getMonth() + direction);
      else if (view === "week") next.setDate(next.getDate() + 7 * direction);
      else next.setDate(next.getDate() + direction);
      return next;
    });
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
    year: "numeric",
  }).format(anchor);

  const weekStart = startOfWeek(anchor, 0);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const monthGrid = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first, 0);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [anchor]);

  function itemsForLocalDay(day: Date) {
    return filteredItems.filter((item) => {
      const start = churchParts(item.start_at, tz);
      const end = churchParts(item.end_at, tz);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = addDays(dayStart, 1);
      // Compare using church-local calendar dates via constructing local dates
      const itemStart = new Date(start.year, start.month - 1, start.day);
      const itemEnd = new Date(end.year, end.month - 1, end.day, 23, 59, 59);
      return itemStart < dayEnd && itemEnd >= dayStart;
    });
  }

  if (!tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Calendar unavailable</CardTitle>
          <CardDescription>
            {migrationHint ??
              "Apply the scheduling migration before using the calendar."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="mt-1 text-muted-foreground">
            Church security events in {tz}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/schedule/events">
              <List className="h-4 w-4" />
              Events
            </Link>
          </Button>
          {canManage ? (
            <Button asChild>
              <Link href="/schedule/events/new">
                <Plus className="h-4 w-4" />
                New event
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Type
            </label>
            <select
              className="flex h-10 min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm"
              value={filters.type}
              onChange={(e) => pushFilters({ type: e.target.value })}
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
            <label className="text-xs font-medium text-muted-foreground">
              Campus
            </label>
            <select
              className="flex h-10 min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm"
              value={filters.campus}
              onChange={(e) => pushFilters({ campus: e.target.value })}
            >
              <option value="">All campuses</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1 sm:ml-auto">
            {(
              [
                ["month", "Month"],
                ["week", "Week"],
                ["day", "Day"],
                ["agenda", "Agenda"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={view === key ? "default" : "outline"}
                onClick={() => setView(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {view !== "agenda" ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => shiftAnchor(-1)}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="font-semibold">
              {view === "month"
                ? monthLabel
                : view === "week"
                  ? `Week of ${formatChurchDate(weekStart.toISOString(), { timeZone: tz })}`
                  : formatChurchDate(anchor.toISOString(), { timeZone: tz })}
            </p>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setAnchor(new Date())}
            >
              Today
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => shiftAnchor(1)}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {view === "month" ? (
        <div className="overflow-x-auto rounded-lg border">
          <div className="grid min-w-[640px] grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid min-w-[640px] grid-cols-7">
            {monthGrid.map((day) => {
              const inMonth = day.getMonth() === anchor.getMonth();
              const dayItems = itemsForLocalDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[110px] border-b border-r p-2",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    sameDay(day, new Date()) && "bg-primary/5",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium">{day.getDate()}</span>
                    {canManage ? (
                      <Link
                        href={`/schedule/events/new?date=${day.toISOString().slice(0, 10)}`}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        aria-label={`Create event on ${day.toDateString()}`}
                      >
                        +
                      </Link>
                    ) : null}
                  </div>
                  <ul className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="block truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted"
                          aria-label={item.accessible_label}
                          title={item.accessible_label}
                        >
                          <span className="font-medium">{item.title}</span>
                          <span className="sr-only">
                            {" "}
                            — {labelForScheduleEventType(item.event_type)},{" "}
                            {labelForScheduleEventStatus(item.status)}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {dayItems.length > 3 ? (
                      <li className="text-[10px] text-muted-foreground">
                        +{dayItems.length - 3} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" || view === "day" ? (
        <div className="space-y-3">
          {(view === "day" ? [anchor] : weekDays).map((day) => {
            const dayItems = itemsForLocalDay(day);
            return (
              <Card key={day.toISOString()}>
                <CardHeader className="py-3">
                  <CardTitle className="text-base">
                    {formatChurchDate(day.toISOString(), { timeZone: tz })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dayItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events.</p>
                  ) : (
                    dayItems.map((item) => (
                      <CalendarItemRow
                        key={item.id}
                        item={item}
                        timeZone={tz}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {view === "agenda" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Upcoming agenda
            </CardTitle>
            <CardDescription>
              {filteredItems.length} event
              {filteredItems.length === 1 ? "" : "s"} in range
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events match these filters.
              </p>
            ) : (
              filteredItems.map((item) => (
                <CalendarItemRow key={item.id} item={item} timeZone={tz} />
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CalendarItemRow({
  item,
  timeZone,
}: {
  item: ScheduleCalendarItem;
  timeZone: string;
}) {
  return (
    <Link
      href={item.href}
      className="flex flex-col gap-1 rounded-md border p-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
      aria-label={item.accessible_label}
    >
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {item.all_day
            ? formatChurchDate(item.start_at, { timeZone })
            : `${formatChurchDateTime(item.start_at, { timeZone })} – ${formatChurchDateTime(item.end_at, { timeZone })}`}
          {item.location_name ? ` · ${item.location_name}` : ""}
          {item.campus_name ? ` · ${item.campus_name}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant={eventTypeBadgeVariant(item.event_type)}>
          {labelForScheduleEventType(item.event_type)}
        </Badge>
        <Badge variant="outline">
          {labelForScheduleEventStatus(item.status)}
        </Badge>
        {item.status === "cancelled" ? (
          <Badge variant="destructive">Cancelled</Badge>
        ) : null}
      </div>
    </Link>
  );
}
