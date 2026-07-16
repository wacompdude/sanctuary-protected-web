import { Suspense } from "react";
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
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/incidents/format";
import { getCurrentChurchThreatLevel } from "@/lib/church/threat-level-queries";
import {
  canManageThreatLevels,
  formatThreatWeek,
  labelForThreatLevel,
  rankLabelForThreatLevel,
  threatLevelBadgeClassName,
} from "@/lib/church/threat-levels";

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
    },
    {
      label: "Unacknowledged Events",
      value: String(unackedEvents),
      description: "Device alerts needing review",
      href: "/events",
    },
    {
      label: "Expiring Certifications",
      value: String(certCounts.expiring_soon),
      description: "Expiring within 60 days",
      href: "/certifications",
    },
    {
      label: "Expired Certifications",
      value: String(certCounts.expired),
      description: "Need renewal",
      href: "/certifications",
    },
  ];

  return (
    <>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div>
              <CardDescription>Weekly Threat Level</CardDescription>
              {currentThreatLevel ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Badge
                    className={`px-3 py-1 text-sm ${threatLevelBadgeClassName(currentThreatLevel.threat_level)}`}
                  >
                    {labelForThreatLevel(currentThreatLevel.threat_level)}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {rankLabelForThreatLevel(currentThreatLevel.threat_level)}
                  </p>
                </div>
              ) : (
                <CardTitle className="mt-2 text-2xl">
                  No threat level recorded
                </CardTitle>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {currentThreatLevel
                ? `Week of ${formatThreatWeek(currentThreatLevel.week_start)}. Last changed by ${currentThreatLevel.changed_by_name} on ${formatDateTime(currentThreatLevel.created_at)}.`
                : "Set the weekly threat level so the team sees the current operational posture at a glance."}
            </p>
          </div>
          {canManageThreatLevels(membership.role) && (
            <Button asChild>
              <Link href="/dashboard/threat-level">
                {currentThreatLevel ? "Change threat level" : "Set threat level"}
              </Link>
            </Button>
          )}
        </CardHeader>
      </Card>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview for {church.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="block">
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardHeader className="pb-2">
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
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
