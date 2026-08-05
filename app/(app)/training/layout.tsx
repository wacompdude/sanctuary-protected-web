import { Suspense } from "react";
import { TrainingUpgradeGate } from "@/components/training/upgrade-gate";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { getTrainingAccess } from "@/lib/training/access";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Training",
  robots: { index: false, follow: false },
};

async function TrainingLayoutGate({ children }: { children: React.ReactNode }) {
  const { church } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Training Management</h1>
        <p className="mt-1 text-muted-foreground">
          Document security training events, attendance, and completion history.
        </p>
      </div>

      {!access.allowed ? <TrainingUpgradeGate /> : children}
    </div>
  );
}

export default function TrainingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted-foreground">Loading training…</div>
      }
    >
      <TrainingLayoutGate>{children}</TrainingLayoutGate>
    </Suspense>
  );
}
