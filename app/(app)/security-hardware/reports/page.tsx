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
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getEquipmentSummary,
} from "@/lib/security-hardware/queries";
import { getEquipmentReportBreakdown } from "@/lib/security-hardware/media-queries";
import { ArrowLeft, Download } from "lucide-react";

async function ReportsContent() {
  const { church } = await getAuthenticatedUserWithChurch();
  const [summary, breakdown] = await Promise.all([
    getEquipmentSummary(church.id),
    getEquipmentReportBreakdown(church.id),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
            <Link href="/security-hardware">
              <ArrowLeft className="h-4 w-4" />
              Back to inventory
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Hardware reports</h1>
          <p className="mt-1 text-muted-foreground">
            Snapshot and CSV export for {church.name}.
          </p>
        </div>
        <Button asChild>
          <Link href="/security-hardware/export">
            <Download className="h-4 w-4" />
            Export CSV
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inventory snapshot</CardTitle>
            <CardDescription>Non-archived equipment counts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Total: {summary.total}</p>
            <p>Active: {summary.active}</p>
            <p>Out of service / maintenance: {summary.outOfService}</p>
            <p>High / critical: {summary.critical}</p>
            <p>Unassigned: {summary.unassigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle alerts</CardTitle>
            <CardDescription>Based on church warning periods.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <Link
                className="underline underline-offset-4"
                href="/security-hardware?maintenanceDue=1"
              >
                Maintenance due: {summary.maintenanceDue}
              </Link>
            </p>
            <p>
              <Link
                className="underline underline-offset-4"
                href="/security-hardware?warrantyExpiring=1"
              >
                Warranty expiring: {summary.warrantyExpiring}
              </Link>
            </p>
            <p>
              <Link
                className="underline underline-offset-4"
                href="/security-hardware?replacementDue=1"
              >
                Replacement due: {summary.replacementDue}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
            <CardDescription>Non-archived equipment only.</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No equipment yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {breakdown.byCategory.map((row) => (
                  <li
                    key={row.category}
                    className="flex items-center justify-between gap-3"
                  >
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/security-hardware?category=${row.category}`}
                    >
                      {row.label}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
            <CardDescription>Non-archived equipment only.</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.byStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No equipment yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {breakdown.byStatus.map((row) => (
                  <li
                    key={row.status}
                    className="flex items-center justify-between gap-3"
                  >
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/security-hardware?status=${row.status}`}
                    >
                      {row.label}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV export</CardTitle>
          <CardDescription>
            Downloads the full inventory including archived items for offline
            review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/security-hardware/export">
              <Download className="h-4 w-4" />
              Download inventory CSV
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

async function ReportsWrapper() {
  try {
    return <ReportsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load reports.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function SecurityHardwareReportsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <ReportsWrapper />
      </Suspense>
    </div>
  );
}
