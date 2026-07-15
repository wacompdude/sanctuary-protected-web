import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  formatEquipmentDate,
  labelForEquipmentStatus,
} from "@/lib/security-hardware/constants";
import {
  labelForMaintenanceStatus,
  labelForMaintenanceType,
  type EquipmentMaintenanceRecord,
} from "@/lib/security-hardware/operations";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/security-hardware/queries";
import { getMaintenanceDashboard } from "@/lib/security-hardware/ops-queries";
import { ArrowLeft } from "lucide-react";

function MaintenanceList({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: EquipmentMaintenanceRecord[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description} · {rows.length} item{rows.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <Link
                    href={`/security-hardware/${row.equipment_id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.equipment_name || "Equipment"}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {labelForMaintenanceType(row.maintenance_type)} ·{" "}
                    {labelForMaintenanceStatus(row.status)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due {formatEquipmentDate(row.scheduled_date)}
                    {row.equipment_asset_tag
                      ? ` · ${row.equipment_asset_tag}`
                      : ""}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/security-hardware/${row.equipment_id}`}>
                    Open
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function MaintenanceContent() {
  const { church } = await getAuthenticatedUserWithChurch();
  const data = await getMaintenanceDashboard(church.id);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/security-hardware">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          Hardware maintenance
        </h1>
        <p className="mt-1 text-muted-foreground">
          Overdue work, upcoming inspections, and failed checks for{" "}
          {church.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overdue</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {data.overdue.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Due within 30 days</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {data.dueSoon.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed inspections</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {data.failed.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Out of service / maintenance</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {data.outOfServiceEquipment.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MaintenanceList
          title="Overdue"
          description="Past scheduled date"
          rows={data.overdue}
          empty="Nothing overdue."
        />
        <MaintenanceList
          title="Due within 30 days"
          description="Upcoming scheduled work"
          rows={data.dueSoon}
          empty="Nothing due in the next 30 days."
        />
        <MaintenanceList
          title="Scheduled later"
          description="Beyond 30 days or undated open work"
          rows={data.scheduled}
          empty="No later scheduled items."
        />
        <MaintenanceList
          title="Failed inspections"
          description="Require follow-up"
          rows={data.failed}
          empty="No failed inspections."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently completed</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentlyCompleted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed maintenance yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentlyCompleted.map((row) => (
                <li key={row.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <Link
                    href={`/security-hardware/${row.equipment_id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.equipment_name || "Equipment"}
                  </Link>
                  <p className="text-muted-foreground">
                    {labelForMaintenanceType(row.maintenance_type)} · completed{" "}
                    {formatEquipmentDate(row.completed_date)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Out-of-service equipment</CardTitle>
        </CardHeader>
        <CardContent>
          {data.outOfServiceEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No equipment currently marked out of service or in maintenance.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.outOfServiceEquipment.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <Link
                      href={`/security-hardware/${row.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {labelForEquipmentStatus(row.status)}
                      {row.asset_tag ? ` · ${row.asset_tag}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function MaintenanceWrapper() {
  try {
    return <MaintenanceContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load maintenance.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function SecurityHardwareMaintenancePage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading maintenance…
            </CardContent>
          </Card>
        }
      >
        <MaintenanceWrapper />
      </Suspense>
    </div>
  );
}
