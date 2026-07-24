import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Radio } from "lucide-react";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";

async function SensorsContent() {
  let upgradeMessage: string | null = null;
  try {
    const { church } = await getAuthenticatedUserWithChurch();
    const access = await hasFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.SENSORS,
    });
    if (!access.allowed) {
      upgradeMessage =
        access.reason ??
        "Sensors are not included in your current plan. Upgrade to unlock this feature.";
    }
  } catch {
    // Unauthenticated / no church — page still shows placeholder shell.
  }

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sensors</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor motion, perimeter, and environmental sensors.
        </p>
      </div>

      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Radio className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>
            {upgradeMessage ? "Upgrade required" : "Coming Soon"}
          </CardTitle>
          <CardDescription>
            {upgradeMessage ??
              "Sensor monitoring and alerts will be available in a future update. You will be able to view sensor status and configure alert thresholds."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {upgradeMessage
            ? "This feature is gated by your subscription entitlements."
            : "This page is a placeholder for the sensors feature."}
        </CardContent>
      </Card>
    </>
  );
}

export default function SensorsPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Loading sensors…
            </CardContent>
          </Card>
        }
      >
        <SensorsContent />
      </Suspense>
    </div>
  );
}
