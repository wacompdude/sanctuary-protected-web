import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  isChurchOperationallyLocked,
  resolveChurchLandingPath,
} from "@/lib/church/operations";
import { parseAppPreferences } from "@/lib/church/settings";
import { Card, CardContent } from "@/components/ui/card";

async function HomeLandingContent(): Promise<React.ReactNode> {
  try {
    const { supabase, church } = await getAuthenticatedUserWithChurch();

    if (isChurchOperationallyLocked(church.status)) {
      redirect("/settings/church/danger");
    }

    const { data } = await supabase
      .from("churches")
      .select("settings")
      .eq("id", church.id)
      .maybeSingle();

    const preferences = parseAppPreferences(data?.settings);
    redirect(resolveChurchLandingPath(preferences));
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    redirect("/dashboard");
  }

  return null;
}

export default function HomeLandingPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading your workspace…
          </CardContent>
        </Card>
      }
    >
      <HomeLandingContent />
    </Suspense>
  );
}
