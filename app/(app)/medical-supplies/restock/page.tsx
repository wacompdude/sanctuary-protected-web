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
import { labelForMedicalSupplyCategory } from "@/lib/medical-supplies/constants";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getRestockReport,
} from "@/lib/medical-supplies/queries";
import { ArrowLeft } from "lucide-react";

async function RestockReportContent() {
  const { church } = await getAuthenticatedUserWithChurch();
  const rows = await getRestockReport(church.id);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/medical-supplies">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Restock report</h1>
        <p className="mt-1 text-muted-foreground">
          Supplies at or below minimum on-hand for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items to reorder</CardTitle>
          <CardDescription>
            {rows.length} item{rows.length === 1 ? "" : "s"} need attention ·
            usage shown for last 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All supplies are above their minimum levels.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Supply</th>
                    <th className="pb-3 pr-4 font-medium">On hand</th>
                    <th className="pb-3 pr-4 font-medium">Minimum</th>
                    <th className="pb-3 pr-4 font-medium">Short by</th>
                    <th className="pb-3 pr-4 font-medium">Used (30d)</th>
                    <th className="pb-3 font-medium">Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 pr-4 align-top">
                        <Link
                          href={`/medical-supplies/${row.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {labelForMedicalSupplyCategory(row.category)}
                        </p>
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums">
                        {row.quantity_on_hand} {row.unit}
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums">
                        {row.minimum_quantity} {row.unit}
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums font-medium text-destructive">
                        {Math.max(0, row.reorder_gap)} {row.unit}
                      </td>
                      <td className="py-3 pr-4 align-top tabular-nums text-muted-foreground">
                        {row.used_last_30d} {row.unit}
                      </td>
                      <td className="py-3 align-top text-muted-foreground">
                        {row.vendor_name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function RestockReportWrapper() {
  try {
    return <RestockReportContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load restock report.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function RestockReportPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading restock report…
            </CardContent>
          </Card>
        }
      >
        <RestockReportWrapper />
      </Suspense>
    </div>
  );
}
