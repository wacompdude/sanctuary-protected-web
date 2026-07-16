import Link from "next/link";
import { Suspense } from "react";
import { MedicalSupplyForm } from "@/components/medical-supplies/medical-supply-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/medical-supplies/queries";
import { canManageMedicalSupplies } from "@/lib/medical-supplies/types";
import { ArrowLeft } from "lucide-react";

async function NewMedicalSupplyContent() {
  const { membership } = await getAuthenticatedUserWithChurch();

  if (!canManageMedicalSupplies(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only administrators and security leaders can add medical supplies.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/medical-supplies">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Add medical supply</h1>
      </div>
      <MedicalSupplyForm />
    </>
  );
}

export default function NewMedicalSupplyPage() {
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
        <NewMedicalSupplyContent />
      </Suspense>
    </div>
  );
}
