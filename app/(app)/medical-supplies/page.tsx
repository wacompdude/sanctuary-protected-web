import Link from "next/link";
import { Suspense } from "react";
import { MedicalSupplyTable } from "@/components/medical-supplies/medical-supply-table";
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
  getMedicalSupplySummary,
  listMedicalSupplies,
} from "@/lib/medical-supplies/queries";
import { canManageMedicalSupplies } from "@/lib/medical-supplies/types";
import { ClipboardList, Plus } from "lucide-react";

async function MedicalSuppliesContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageMedicalSupplies(membership.role);
  const [items, summary] = await Promise.all([
    listMedicalSupplies(church.id),
    getMedicalSupplySummary(church.id),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Medical supplies</h1>
          <p className="mt-1 text-muted-foreground">
            Consumable medical inventory for {church.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/medical-supplies/restock">
              <ClipboardList className="h-4 w-4" />
              Restock report
            </Link>
          </Button>
          {canManage && (
            <Button asChild>
              <Link href="/medical-supplies/new">
                <Plus className="h-4 w-4" />
                Add supply
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active items</CardDescription>
            <CardTitle className="text-2xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Need reorder</CardDescription>
            <CardTitle className="text-2xl text-amber-600 dark:text-amber-400">
              {summary.lowStock}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Out of stock</CardDescription>
            <CardTitle className="text-2xl text-destructive">
              {summary.outOfStock}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>
            Gloves, bandages, and other consumable medical supplies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MedicalSupplyTable items={items} canManage={canManage} />
        </CardContent>
      </Card>
    </>
  );
}

async function MedicalSuppliesWrapper() {
  try {
    return <MedicalSuppliesContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load medical supplies.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function MedicalSuppliesPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading medical supplies…
            </CardContent>
          </Card>
        }
      >
        <MedicalSuppliesWrapper />
      </Suspense>
    </div>
  );
}
