import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MedicalSupplyForm } from "@/components/medical-supplies/medical-supply-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getMedicalSupplyById,
} from "@/lib/medical-supplies/queries";
import { canManageMedicalSupplies } from "@/lib/medical-supplies/types";
import { ArrowLeft } from "lucide-react";

async function EditMedicalSupplyContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canManageMedicalSupplies(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only administrators and security leaders can edit medical supplies.
        </CardContent>
      </Card>
    );
  }

  const supply = await getMedicalSupplyById(id, church.id);
  if (!supply) notFound();

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href={`/medical-supplies/${supply.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to supply
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Edit supply</h1>
      </div>
      <MedicalSupplyForm supply={supply} />
    </>
  );
}

async function EditMedicalSupplyLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    return <EditMedicalSupplyContent id={id} />;
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

export default function EditMedicalSupplyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <EditMedicalSupplyLoader params={params} />
      </Suspense>
    </div>
  );
}
