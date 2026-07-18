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
import { getCurrentChurchThreatLevel } from "@/lib/church/threat-level-queries";
import {
  canManageThreatLevels,
  formatThreatWeek,
  labelForThreatLevel,
  rankLabelForThreatLevel,
  threatLevelBadgeClassName,
  threatLevelBadgeStyle,
} from "@/lib/church/threat-levels";

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
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const [certCounts, incidents, unackedEvents, currentThreatLevel] = await Promise.all([
    getCertificationCounts(church.id),
    listIncidentsForChurch(church.id).catch(() => []),
    getUnacknowledgedEventCount(church.id).catch(() => 0),
    getCurrentChurchThreatLevel(church.id).catch(() => null),
  ]);

  const openIncidents = incidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  ).length;

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
      description: "Expiring within 60 days",
      href: "/certifications",
      tone: "blue" as const,
    },
    {
      label: "Expired Certifications",
      value: String(certCounts.expired),
      description: "Need renewal",
      href: "/certifications",
      tone: "yellow" as const,
    },
  ];

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
            {canManageThreatLevels(membership.role) && (
              <Button asChild className="hidden h-11 shrink-0 md:inline-flex">
                <Link href="/dashboard/threat-level">
                  {currentThreatLevel ? "Change threat level" : "Set threat level"}
                </Link>
              </Button>
            )}
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
                Week of {formatThreatWeek(currentThreatLevel.week_start)}. Last
                changed by {currentThreatLevel.changed_by_name} on{" "}
                {formatDateTime(currentThreatLevel.created_at)}.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Set the weekly threat level so the team sees the current operational
              posture at a glance.
            </p>
          )}
          {canManageThreatLevels(membership.role) && (
            <Button asChild className="h-11 w-full md:hidden">
              <Link href="/dashboard/threat-level">
                {currentThreatLevel ? "Change threat level" : "Set threat level"}
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview for {church.name}.
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
