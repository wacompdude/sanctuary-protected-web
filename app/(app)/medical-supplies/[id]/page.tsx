import Link from "next/link";
import { notFound } from "next/navigation";
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
  getMedicalSupplyById,
} from "@/lib/medical-supplies/queries";
import {
  canManageMedicalSupplies,
  isLowStock,
} from "@/lib/medical-supplies/types";
import { Badge } from "@/components/ui/badge";
import { ArchiveMedicalSupplyButton } from "@/components/medical-supplies/archive-medical-supply-button";
import { ArrowLeft, Pencil } from "lucide-react";

async function MedicalSupplyDetailContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const supply = await getMedicalSupplyById(id, church.id);
  if (!supply) notFound();

  const canManage = canManageMedicalSupplies(membership.role);
  const low = isLowStock(supply);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/medical-supplies">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{supply.name}</h1>
            <p className="mt-1 text-muted-foreground">{church.name}</p>
          </div>
          {supply.archived_at ? (
            <Badge variant="outline">Archived</Badge>
          ) : low ? (
            <Badge variant="destructive">Reorder needed</Badge>
          ) : (
            <Badge variant="default">Stock OK</Badge>
          )}
        </div>
        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/medical-supplies/${supply.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
            <ArchiveMedicalSupplyButton
              supplyId={supply.id}
              archived={Boolean(supply.archived_at)}
            />
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory details</CardTitle>
          <CardDescription>On-hand quantity and reorder threshold.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Category</p>
            <p className="text-sm">{labelForMedicalSupplyCategory(supply.category)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Unit</p>
            <p className="text-sm">{supply.unit}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">On hand</p>
            <p className="text-sm font-medium">
              {supply.quantity_on_hand} {supply.unit}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Minimum</p>
            <p className="text-sm">
              {supply.minimum_quantity} {supply.unit}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Location</p>
            <p className="text-sm">{supply.location_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Vendor</p>
            <p className="text-sm">{supply.vendor_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">SKU</p>
            <p className="text-sm">{supply.sku || "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Notes</p>
            <p className="text-sm text-muted-foreground">{supply.notes || "—"}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

async function MedicalSupplyDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    return <MedicalSupplyDetailContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    if (error instanceof ChurchAccessError) {
      return (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      );
    }
    throw error;
  }
}

export default function MedicalSupplyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading supply…
            </CardContent>
          </Card>
        }
      >
        <MedicalSupplyDetailLoader params={params} />
      </Suspense>
    </div>
  );
}
