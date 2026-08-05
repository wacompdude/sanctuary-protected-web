import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TrainingSettingsForm } from "@/components/training/training-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { getTrainingAccess } from "@/lib/training/access";
import { canManageSettings } from "@/lib/training/permissions";
import { getSettings } from "@/lib/training/queries";

async function TrainingSettingsContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;
  if (!canManageSettings(membership.role)) redirect("/training");

  const settings = await getSettings(church.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training settings</CardTitle>
        <CardDescription>
          Renewal reminders, notifications, and dashboard metric card colors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TrainingSettingsForm settings={settings} />
      </CardContent>
    </Card>
  );
}

export default function TrainingSettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingSettingsContent />
    </Suspense>
  );
}
