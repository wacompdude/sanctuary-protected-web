"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RenewalStatusBadge } from "@/components/training/status-badges";
import { classifyRenewalStatus } from "@/lib/training/renewal";
import {
  collectRequiredCourseIds,
  isRequiredTrainingAudienceRole,
} from "@/lib/training/compliance-shared";
import type { MembershipRole } from "@/lib/organization/types";
import type {
  TrainingCategoryWithState,
  TrainingCompletionRecord,
  TrainingCourse,
  TrainingEvent,
  TrainingRequirement,
} from "@/lib/training/types";

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const REPORT_TYPES = [
  {
    id: "member",
    label: "Completion by member",
    description: "Training history grouped by team member.",
  },
  {
    id: "course",
    label: "Completion by course",
    description: "Who completed each course.",
  },
  {
    id: "category",
    label: "Completion by category",
    description: "Completions rolled up by training category.",
  },
  {
    id: "compliance",
    label: "Required training compliance",
    description: "Required courses vs members who have completed them.",
  },
  {
    id: "hours",
    label: "Training hours by member",
    description: "Total documented training hours per member.",
  },
] as const;

type ReportTypeId = (typeof REPORT_TYPES)[number]["id"];

export function TrainingReportsClient({
  reportType,
  records,
  courses,
  categories,
  requirements,
  events,
  teamMembers,
  churchName,
  dueSoonDays,
}: {
  reportType: string;
  records: TrainingCompletionRecord[];
  courses: TrainingCourse[];
  categories: TrainingCategoryWithState[];
  requirements: TrainingRequirement[];
  events: TrainingEvent[];
  teamMembers: Array<{ userId: string; name: string; role?: MembershipRole }>;
  churchName: string;
  dueSoonDays: number;
}) {
  const activeType = (
    REPORT_TYPES.some((r) => r.id === reportType) ? reportType : "member"
  ) as ReportTypeId;

  const audienceMembers = useMemo(
    () =>
      teamMembers.filter(
        (member) =>
          !member.role || isRequiredTrainingAudienceRole(member.role),
      ),
    [teamMembers],
  );

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of audienceMembers) {
      map.set(member.userId, member.name);
    }
    for (const record of records) {
      if (record.member_name) map.set(record.user_id, record.member_name);
    }
    return map;
  }, [audienceMembers, records]);

  const requiredCourseIds = useMemo(
    () => collectRequiredCourseIds({ requirements, courses }),
    [requirements, courses],
  );

  const nextOpenEventByCourseId = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, TrainingEvent>();
    for (const event of events) {
      if (!event.training_course_id || !event.start_at) continue;
      if (
        event.status === "cancelled" ||
        event.status === "archived" ||
        event.status === "draft" ||
        event.status === "completed"
      ) {
        continue;
      }
      const startMs = new Date(event.start_at).getTime();
      if (Number.isNaN(startMs) || startMs < now) continue;
      const existing = map.get(event.training_course_id);
      if (
        !existing ||
        new Date(event.start_at).getTime() <
          new Date(existing.start_at ?? 0).getTime()
      ) {
        map.set(event.training_course_id, event);
      }
    }
    return map;
  }, [events]);

  const complianceRows = useMemo(() => {
    const requiredCourses = courses.filter((c) => requiredCourseIds.has(c.id));
    return requiredCourses.map((course) => {
      const completers = new Set(
        records
          .filter(
            (r) =>
              r.training_course_id === course.id &&
              (r.completion_status === "completed" ||
                r.completion_status === "passed" ||
                r.completion_status === "exempt"),
          )
          .map((r) => r.user_id),
      );
      const completedMembers = audienceMembers.filter((m) =>
        completers.has(m.userId),
      );
      const missingMembers = audienceMembers.filter(
        (m) => !completers.has(m.userId),
      );
      const rate =
        audienceMembers.length === 0
          ? 0
          : Math.round((completedMembers.length / audienceMembers.length) * 100);
      return {
        course,
        completedMembers,
        missingMembers,
        rate,
        nextEvent: nextOpenEventByCourseId.get(course.id) ?? null,
      };
    });
  }, [
    courses,
    requiredCourseIds,
    records,
    audienceMembers,
    nextOpenEventByCourseId,
  ]);

  const hoursByMember = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; count: number }>();
    for (const member of teamMembers) {
      map.set(member.userId, { name: member.name, hours: 0, count: 0 });
    }
    for (const record of records) {
      const existing = map.get(record.user_id) ?? {
        name: record.member_name ?? memberNameById.get(record.user_id) ?? record.user_id,
        hours: 0,
        count: 0,
      };
      existing.hours += Number(record.training_hours ?? 0);
      existing.count += 1;
      map.set(record.user_id, existing);
    }
    return [...map.entries()]
      .map(([userId, value]) => ({ userId, ...value }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  }, [records, teamMembers, memberNameById]);

  const grouped = useMemo(() => {
    if (activeType === "course") {
      const map = new Map<string, TrainingCompletionRecord[]>();
      for (const record of records) {
        const key = record.course_name;
        const list = map.get(key) ?? [];
        list.push(record);
        map.set(key, list);
      }
      return [...map.entries()].map(([key, value]) => ({ key, records: value }));
    }
    if (activeType === "category") {
      const map = new Map<string, TrainingCompletionRecord[]>();
      for (const record of records) {
        const key = record.category_name ?? "Uncategorized";
        const list = map.get(key) ?? [];
        list.push(record);
        map.set(key, list);
      }
      return [...map.entries()].map(([key, value]) => ({ key, records: value }));
    }
    if (activeType === "member") {
      const map = new Map<string, TrainingCompletionRecord[]>();
      for (const record of records) {
        const key =
          record.member_name ??
          memberNameById.get(record.user_id) ??
          record.user_id;
        const list = map.get(key) ?? [];
        list.push(record);
        map.set(key, list);
      }
      return [...map.entries()].map(([key, value]) => ({ key, records: value }));
    }
    return [];
  }, [records, activeType, memberNameById]);

  const upcomingRequired = useMemo(
    () =>
      events.filter(
        (event) =>
          event.required &&
          event.start_at &&
          new Date(event.start_at).getTime() >= Date.now() &&
          event.status !== "cancelled" &&
          event.status !== "archived",
      ),
    [events],
  );

  function exportCsv() {
    if (activeType === "compliance") {
      const rows: string[][] = [
        ["Course", "Required", "Completed count", "Team size", "Compliance %", "Missing members"],
      ];
      for (const row of complianceRows) {
        rows.push([
          row.course.name,
          "yes",
          String(row.completedMembers.length),
          String(audienceMembers.length),
          `${row.rate}%`,
          row.missingMembers.map((m) => m.name).join("; "),
        ]);
      }
      downloadCsv(`training-report-compliance.csv`, rows);
      return;
    }
    if (activeType === "hours") {
      const rows: string[][] = [["Member", "Completions", "Training hours"]];
      for (const row of hoursByMember) {
        rows.push([row.name, String(row.count), row.hours.toFixed(2)]);
      }
      downloadCsv(`training-report-hours.csv`, rows);
      return;
    }
    const header = [
      "Member",
      "Course",
      "Category",
      "Completed",
      "Hours",
      "Renewal status",
      "Renewal due",
      "Source",
    ];
    const rows = records.map((record) => [
      record.member_name ?? memberNameById.get(record.user_id) ?? "",
      record.course_name,
      record.category_name ?? "",
      record.completed_at,
      String(record.training_hours ?? ""),
      record.renewal_status ??
        classifyRenewalStatus({
          dueAt: record.renewal_due_at,
          dueSoonDays,
        }),
      record.renewal_due_at ?? "",
      record.source_type,
    ]);
    downloadCsv(`training-report-${activeType}.csv`, [header, ...rows]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">
            Five training report types for {churchName}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {REPORT_TYPES.map((report) => (
          <Link
            key={report.id}
            href={`/training/reports?type=${report.id}`}
            className={`rounded-lg border p-3 transition-colors hover:bg-muted/40 ${
              activeType === report.id ? "border-primary bg-muted/30" : ""
            }`}
          >
            <p className="text-sm font-medium">{report.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.description}
            </p>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-3 rounded-lg border p-4">
        <select
          name="type"
          defaultValue={activeType}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {REPORT_TYPES.map((report) => (
            <option key={report.id} value={report.id}>
              {report.label}
            </option>
          ))}
        </select>
        <select
          name="course"
          defaultValue=""
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
        <select
          name="category"
          defaultValue=""
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Run report
        </Button>
      </form>

      {upcomingRequired.length > 0 && activeType === "compliance" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Upcoming required events</CardTitle>
            <CardDescription>
              Required sessions still on the training calendar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingRequired.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">{event.name}</span>
                <span className="text-muted-foreground">
                  {event.start_at?.slice(0, 10) ?? "TBD"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeType === "compliance" ? (
        complianceRows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No required training courses are configured.
            </CardContent>
          </Card>
        ) : (
          complianceRows.map((row) => (
            <Card key={row.course.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {row.nextEvent ? (
                    <Link
                      href={`/training/events/${row.nextEvent.id}`}
                      className="hover:underline"
                    >
                      <CardTitle className="text-base">{row.course.name}</CardTitle>
                    </Link>
                  ) : (
                    <>
                      <CardTitle className="text-base">{row.course.name}</CardTitle>
                      <Link
                        href={`/training/events/new?courseId=${row.course.id}&categoryId=${row.course.training_category_id}`}
                        className="text-sm font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                      >
                        Training Event has not been Scheduled
                      </Link>
                    </>
                  )}
                </div>
                <CardDescription>
                  {row.completedMembers.length} of {audienceMembers.length}{" "}
                  members completed · {row.rate}% compliance
                  {row.nextEvent?.start_at
                    ? ` · Next event ${row.nextEvent.start_at.slice(0, 10)}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Completed
                  </p>
                  <ul className="space-y-1 text-sm">
                    {row.completedMembers.map((m) => (
                      <li key={m.userId}>{m.name}</li>
                    ))}
                    {row.completedMembers.length === 0 ? (
                      <li className="text-muted-foreground">None yet</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Missing
                  </p>
                  <ul className="space-y-1 text-sm">
                    {row.missingMembers.map((m) => (
                      <li key={m.userId}>{m.name}</li>
                    ))}
                    {row.missingMembers.length === 0 ? (
                      <li className="text-muted-foreground">All complete</li>
                    ) : null}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))
        )
      ) : activeType === "hours" ? (
        hoursByMember.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No training hours recorded.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hours summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {hoursByMember.map((row) => (
                <div
                  key={row.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} completion{row.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="font-medium">{row.hours.toFixed(1)} hrs</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No records match this report.
          </CardContent>
        </Card>
      ) : (
        grouped.map((group) => (
          <Card key={group.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{group.key}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.records.map((record) => (
                <div
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{record.course_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.member_name ??
                        memberNameById.get(record.user_id) ??
                        "Member"}{" "}
                      · {record.completed_at.slice(0, 10)}
                      {record.training_hours != null
                        ? ` · ${record.training_hours} hrs`
                        : ""}
                    </p>
                  </div>
                  <RenewalStatusBadge
                    status={
                      record.renewal_status ??
                      classifyRenewalStatus({
                        dueAt: record.renewal_due_at,
                        dueSoonDays,
                      })
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
