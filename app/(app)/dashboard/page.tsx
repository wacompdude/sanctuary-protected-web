import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getCertificationCounts } from "@/lib/certifications/queries";
import { listIncidentsForChurch } from "@/lib/incidents/queries";
import { getUnacknowledgedEventCount } from "@/lib/events/queries";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/incidents/format";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { getCurrentChurchThreatLevel } from "@/lib/church/threat-level-queries";
import {
  canManageThreatLevels,
  formatThreatWeek,
  labelForThreatLevel,
  rankLabelForThreatLevel,
  threatLevelBadgeClassName,
  threatLevelBadgeStyle,
} from "@/lib/church/threat-levels";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { getScheduleDashboardSummary } from "@/lib/schedule/dashboard-queries";
import {
  campusFilterLabel,
  campusFilterOrClause,
  resolveCampusFilter,
} from "@/lib/campuses/filter";

type DashboardStatTone =
  | "red"
  | "orange"
  | "blue"
  | "yellow"
  | "silver"
  | "bright-red";

const DASHBOARD_STAT_TONES: Record<
  DashboardStatTone,
  {
    card: CSSProperties;
    textClass: string;
    mutedTextClass: string;
  }
> = {
  red: {
    card: threatLevelBadgeStyle("red"),
    textClass: "text-red-950",
    mutedTextClass: "text-red-950/70",
  },
  orange: {
    card: threatLevelBadgeStyle("orange"),
    textClass: "text-orange-950",
    mutedTextClass: "text-orange-950/70",
  },
  blue: {
    card: threatLevelBadgeStyle("blue"),
    textClass: "text-blue-950",
    mutedTextClass: "text-blue-950/70",
  },
  yellow: {
    card: threatLevelBadgeStyle("yellow"),
    textClass: "text-yellow-950",
    mutedTextClass: "text-yellow-950/70",
  },
  silver: {
    card: {
      backgroundColor: "#c0c0c0",
      borderColor: "#9ca3af",
      borderStyle: "solid",
      borderWidth: "1px",
      color: "#111111",
    },
    textClass: "text-neutral-900",
    mutedTextClass: "text-neutral-800/75",
  },
  "bright-red": {
    card: {
      backgroundColor: "#ff1a1a",
      borderColor: "#b91c1c",
      borderStyle: "solid",
      borderWidth: "1px",
      color: "#ffffff",
    },
    textClass: "text-white",
    mutedTextClass: "text-white/85",
  },
};

async function DashboardContent() {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const campusFilter = await resolveCampusFilter({
    churchId: church.id,
    userId: user.id,
    role: membership.role,
  });
  const campusOr = campusFilterOrClause(campusFilter);
  const filterLabel = campusFilterLabel(campusFilter);

  const [certCounts, incidents, unackedEvents, currentThreatLevel, schedule] =
    await Promise.all([
      getCertificationCounts(church.id),
      listIncidentsForChurch(church.id, "occurred_at_desc", {
        campusFilterOr: campusOr,
      }).catch(() => []),
      getUnacknowledgedEventCount(church.id, {
        campusFilterOr: campusOr,
      }).catch(() => 0),
      getCurrentChurchThreatLevel(church.id).catch(() => null),
      getScheduleDashboardSummary(
        church.id,
        user.id,
        church.timezone ?? "America/Los_Angeles",
        { campusFilterOr: campusOr },
      ).catch(() => null),
    ]);

  const openIncidents = incidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  ).length;

  const canSeeManagerSchedule = canManageSchedule(membership.role);

  const stats = [
    {
      label: "Active Incidents",
      value: String(openIncidents),
      description: `${incidents.length} total on record`,
      href: "/incidents",
      tone: "red" as const,
    },
    {
      label: "Unacknowledged Events",
      value: String(unackedEvents),
      description: "Device alerts needing review",
      href: "/events",
      tone: "orange" as const,
    },
    {
      label: "Camera Events",
      value: "—",
      description: "Placeholder — camera feed alerts coming soon",
      href: "/cameras",
      tone: "silver" as const,
      placeholder: true,
    },
    {
      label: "Security Alarm Events",
      value: "—",
      description: "Placeholder — alarm monitoring coming soon",
      href: "/sensors",
      tone: "bright-red" as const,
      placeholder: true,
    },
    {
      label: "Expiring Certifications",
      value: String(certCounts.expiring_soon),
      description: "Expiring within 60 days (church-wide)",
      href: "/certifications",
      tone: "blue" as const,
    },
    {
      label: "Expired Certifications",
      value: String(certCounts.expired),
      description: "Need renewal (church-wide)",
      href: "/certifications",
      tone: "yellow" as const,
    },
  ];

  const scheduleStats =
    schedule?.tablesAvailable
      ? [
          {
            label: "Upcoming Events",
            value: String(schedule.upcomingEvents),
            description: "Next 7 days",
            href: "/schedule/events",
            tone: "blue" as const,
          },
          {
            label: "Today's Shifts",
            value: String(schedule.todaysShifts),
            description: "Coverage windows today",
            href: "/schedule/shifts",
            tone: "orange" as const,
          },
          ...(canSeeManagerSchedule
            ? [
                {
                  label: "Unfilled Shifts",
                  value: String(schedule.unfilledShifts),
                  description: "Next 7 days needing staff",
                  href: "/schedule/shifts?unfilled=1",
                  tone: "red" as const,
                },
                {
                  label: "Pending Responses",
                  value: String(schedule.pendingResponses),
                  description: "Invites awaiting accept/decline",
                  href: "/schedule/shifts",
                  tone: "yellow" as const,
                },
                {
                  label: "Unavailable Today",
                  value: String(schedule.unavailableToday),
                  description: "Active unavailability blocks",
                  href: "/schedule/availability?view=team",
                  tone: "silver" as const,
                },
              ]
            : []),
          {
            label: "Upcoming Training",
            value: String(schedule.upcomingTraining),
            description: "Training events in 7 days",
            href: "/schedule/events?eventType=training",
            tone: "blue" as const,
          },
        ]
      : [];

  return (
    <>
      <Card>
        <CardHeader className="space-y-0 pb-3">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <CardDescription>Weekly Threat Level</CardDescription>
              {currentThreatLevel ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={threatLevelBadgeClassName(
                      currentThreatLevel.threat_level,
                    )}
                    style={threatLevelBadgeStyle(currentThreatLevel.threat_level)}
                  >
                    {labelForThreatLevel(currentThreatLevel.threat_level)}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {rankLabelForThreatLevel(currentThreatLevel.threat_level)}
                  </p>
                </div>
              ) : (
                <CardTitle className="text-2xl">No threat level recorded</CardTitle>
              )}
            </div>
            <div className="hidden shrink-0 flex-wrap gap-2 md:flex">
              <Button asChild variant="outline" className="h-11">
                <Link href="/dashboard/threat-level/history">
                  Threat level history
                </Link>
              </Button>
              {canManageThreatLevels(membership.role) ? (
                <Button asChild className="h-11">
                  <Link href="/dashboard/threat-level">
                    {currentThreatLevel
                      ? "Change threat level"
                      : "Set threat level"}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentThreatLevel ? (
            <>
              <div className="min-w-0 rounded-md border border-border bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Why this level
                </p>
                {currentThreatLevel.notes ? (
                  <p className="mt-2 break-words whitespace-pre-wrap text-base leading-relaxed text-foreground">
                    {currentThreatLevel.notes}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No notes recorded for this weekly threat level.
                  </p>
                )}
              </div>
              <p className="break-words text-sm text-muted-foreground">
                Week of{" "}
                {formatThreatWeek(
                  currentThreatLevel.week_start,
                  church.timezone,
                )}
                . Last changed by {currentThreatLevel.changed_by_name} on{" "}
                {formatDateTime(
                  currentThreatLevel.created_at,
                  null,
                  church.timezone,
                )}
                .
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Set the weekly threat level so the team sees the current operational
              posture at a glance.
            </p>
          )}
          <div className="flex flex-col gap-2 md:hidden">
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href="/dashboard/threat-level/history">
                Threat level history
              </Link>
            </Button>
            {canManageThreatLevels(membership.role) ? (
              <Button asChild className="h-11 w-full">
                <Link href="/dashboard/threat-level">
                  {currentThreatLevel
                    ? "Change threat level"
                    : "Set threat level"}
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview for {church.name} · {filterLabel}
          {campusFilter.mode === "all" &&
          !campusFilter.implicitAllAccess &&
          campusFilter.accessibleCampusIds.length > 0
            ? ` (${campusFilter.accessibleCampusIds.length} authorized)`
            : ""}
          .
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {stats.map((stat) => {
          const tone = DASHBOARD_STAT_TONES[stat.tone];

          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="block"
              aria-disabled={stat.placeholder ? true : undefined}
            >
              <Card
                className="h-full border shadow-none transition-opacity hover:opacity-90"
                style={tone.card}
              >
                <CardHeader className="space-y-1 p-3 pb-1">
                  <CardDescription
                    className={`text-xs leading-snug ${tone.mutedTextClass}`}
                  >
                    {stat.label}
                  </CardDescription>
                  <CardTitle
                    className={`text-xl font-semibold tabular-nums ${tone.textClass}`}
                  >
                    {stat.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p
                    className={`text-xs leading-snug ${tone.mutedTextClass}`}
                  >
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {schedule?.tablesAvailable ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Scheduling</h2>
              <p className="text-sm text-muted-foreground">
                Live coverage and staffing signals
                {campusFilter.mode === "campus"
                  ? ` for ${filterLabel}`
                  : " across authorized campuses"}
                .
              </p>
            </div>
            <Button asChild variant="outline" className="h-10">
              <Link href="/schedule/calendar">Open calendar</Link>
            </Button>
          </div>

          {schedule.myNextShift ? (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>My next shift</CardDescription>
                <CardTitle className="text-lg">
                  {schedule.myNextShift.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {formatChurchDateTime(schedule.myNextShift.start_at, {
                    timeZone: church.timezone ?? undefined,
                  })}
                  {" – "}
                  {formatChurchDateTime(schedule.myNextShift.end_at, {
                    timeZone: church.timezone ?? undefined,
                  })}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/schedule/shifts/${schedule.myNextShift.id}`}>
                    View shift
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                No upcoming assignments on your schedule.{" "}
                <Link
                  href="/schedule/my-schedule"
                  className="underline underline-offset-2"
                >
                  Open My Schedule
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {scheduleStats.map((stat) => {
              const tone = DASHBOARD_STAT_TONES[stat.tone];
              return (
                <Link key={stat.label} href={stat.href} className="block">
                  <Card
                    className="h-full border shadow-none transition-opacity hover:opacity-90"
                    style={tone.card}
                  >
                    <CardHeader className="space-y-1 p-3 pb-1">
                      <CardDescription
                        className={`text-xs leading-snug ${tone.mutedTextClass}`}
                      >
                        {stat.label}
                      </CardDescription>
                      <CardTitle
                        className={`text-xl font-semibold tabular-nums ${tone.textClass}`}
                      >
                        {stat.value}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p
                        className={`text-xs leading-snug ${tone.mutedTextClass}`}
                      >
                        {stat.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}

function DashboardFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading dashboard…
      </CardContent>
    </Card>
  );
}

async function DashboardWrapper() {
  try {
    return await DashboardContent();
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load dashboard.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<DashboardFallback />}>
        <DashboardWrapper />
      </Suspense>
    </div>
  );
}
