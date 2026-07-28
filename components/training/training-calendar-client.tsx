"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
} from "lucide-react";
import { EventStatusBadge } from "@/components/training/status-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatChurchDate, formatChurchDateTime } from "@/lib/datetime/format";
import type { TrainingEvent } from "@/lib/training/types";
import { cn } from "@/lib/utils";

type CalendarMode = "month" | "list";

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

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eventDayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function TrainingCalendarClient({
  events,
  timeZone,
  canManage,
}: {
  events: TrainingEvent[];
  timeZone: string;
  canManage: boolean;
}) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(anchor);

  const monthGrid = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first, 0);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [anchor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, TrainingEvent[]>();
    for (const event of events) {
      if (!event.start_at) continue;
      const key = eventDayKey(event.start_at, timeZone);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events, timeZone]);

  const monthEventsByDay = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const entries: Array<[string, TrainingEvent[]]> = [];
    for (const [day, dayEvents] of eventsByDay) {
      const [y, m] = day.split("-").map(Number);
      if (y === year && m === month + 1) {
        entries.push([day, dayEvents]);
      }
    }
    return entries.sort(([a], [b]) => a.localeCompare(b));
  }, [anchor, eventsByDay]);

  function shiftMonth(direction: -1 | 1) {
    setAnchor((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Calendar</h2>
          <p className="text-sm text-muted-foreground">
            Training events by month
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={mode === "month" ? "default" : "ghost"}
              className="gap-1.5"
              onClick={() => setMode("month")}
            >
              <CalendarDays className="h-4 w-4" />
              Month
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "list" ? "default" : "ghost"}
              className="gap-1.5"
              onClick={() => setMode("list")}
            >
              <List className="h-4 w-4" />
              List
            </Button>
          </div>
          {canManage ? (
            <Button asChild size="sm">
              <Link href="/training/events/new">
                <Plus className="h-4 w-4" />
                New event
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold">{monthLabel}</p>
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
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {mode === "month" ? (
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
              const key = dayKey(day);
              const dayEvents = eventsByDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[110px] border-b border-r p-2",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    sameDay(day, new Date()) && "bg-primary/5",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium">{day.getDate()}</span>
                    {canManage && inMonth ? (
                      <Link
                        href={`/training/events/new?date=${key}`}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        aria-label={`Create training event on ${key}`}
                      >
                        +
                      </Link>
                    ) : null}
                  </div>
                  <ul className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <li key={event.id}>
                        <Link
                          href={`/training/events/${event.id}`}
                          className="block truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted"
                          title={event.name}
                        >
                          <span className="font-medium">{event.name}</span>
                        </Link>
                      </li>
                    ))}
                    {dayEvents.length > 3 ? (
                      <li className="text-[10px] text-muted-foreground">
                        +{dayEvents.length - 3} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : monthEventsByDay.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No training events scheduled this month.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {monthEventsByDay.map(([day, dayEvents]) => (
            <Card key={day}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {formatChurchDate(day, { timeZone })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dayEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/training/events/${event.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {event.name}
                      </span>
                      {event.start_at ? (
                        <span className="text-xs text-muted-foreground">
                          {formatChurchDateTime(event.start_at, { timeZone })}
                          {event.campus?.name ? ` · ${event.campus.name}` : ""}
                        </span>
                      ) : null}
                    </span>
                    <EventStatusBadge status={event.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
