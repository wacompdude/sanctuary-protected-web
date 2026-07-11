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
import { getCertificationCounts } from "@/lib/certifications/queries";
import { listIncidentsForChurch } from "@/lib/incidents/queries";
import { getUnacknowledgedEventCount } from "@/lib/events/queries";

async function DashboardContent() {
  const { church } = await getAuthenticatedUserWithChurch();
  const [certCounts, incidents, unackedEvents] = await Promise.all([
    getCertificationCounts(church.id),
    listIncidentsForChurch(church.id).catch(() => []),
    getUnacknowledgedEventCount(church.id).catch(() => 0),
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
