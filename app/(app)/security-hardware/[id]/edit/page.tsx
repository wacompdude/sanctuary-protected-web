import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EquipmentForm } from "@/components/security-hardware/equipment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getSecurityEquipmentWithDetails,
  listCampusesForChurch,
} from "@/lib/security-hardware/queries";
import { canManageSecurityEquipment } from "@/lib/security-hardware/types";
import { ArrowLeft } from "lucide-react";

async function EditEquipmentContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canManageSecurityEquipment(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only owners, administrators, and security leaders can edit equipment.
        </CardContent>
      </Card>
    );
  }

  const [equipment, campuses] = await Promise.all([
    getSecurityEquipmentWithDetails(id, church.id),
    listCampusesForChurch(church.id),
  ]);

  if (!equipment) {
    notFound();
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href={`/security-hardware/${equipment.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to equipment
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Edit equipment</h1>
        <p className="mt-1 text-muted-foreground">{equipment.name}</p>
      </div>
      <EquipmentForm
        campuses={campuses}
        mode="edit"
        equipment={equipment}
        categoryDetails={equipment.categoryDetails?.values ?? null}
      />
    </>
  );
}

async function EditEquipmentWrapper({ id }: { id: string }) {
  try {
    return <EditEquipmentContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load this page.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

async function EditEquipmentLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditEquipmentWrapper id={id} />;
}

export default function EditEquipmentPage({
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
              Loading…
            </CardContent>
          </Card>
        }
      >
        <EditEquipmentLoader params={params} />
      </Suspense>
    </div>
  );
}
