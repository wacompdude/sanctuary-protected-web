import Link from "next/link";
import { Suspense } from "react";
import { EquipmentForm } from "@/components/security-hardware/equipment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  listCampusesForChurch,
} from "@/lib/security-hardware/queries";
import { canManageSecurityEquipment } from "@/lib/security-hardware/types";
import { ArrowLeft } from "lucide-react";

async function NewEquipmentContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canManageSecurityEquipment(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only owners, administrators, and security leaders can add equipment.
        </CardContent>
      </Card>
    );
  }

  const campuses = await listCampusesForChurch(church.id);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/security-hardware">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Add equipment</h1>
        <p className="mt-1 text-muted-foreground">
          Create a security hardware record for {church.name}.
        </p>
      </div>
      <EquipmentForm campuses={campuses} mode="create" />
    </>
  );
}

async function NewEquipmentWrapper() {
  try {
    return <NewEquipmentContent />;
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

export default function NewEquipmentPage() {
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
        <NewEquipmentWrapper />
      </Suspense>
    </div>
  );
}
