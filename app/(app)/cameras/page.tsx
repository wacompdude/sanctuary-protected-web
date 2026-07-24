import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Camera } from "lucide-react";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";

async function CamerasContent() {
  let upgradeMessage: string | null = null;
  try {
    const { church } = await getAuthenticatedUserWithChurch();
    const access = await hasFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.CAMERAS,
    });
    if (!access.allowed) {
      upgradeMessage =
        access.reason ??
        "Cameras are not included in your current plan. Upgrade to unlock this feature.";
    }
  } catch {
    // Unauthenticated / no church — page still shows placeholder shell.
  }

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cameras</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor and manage security cameras across your site.
        </p>
      </div>

      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Camera className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>
            {upgradeMessage ? "Upgrade required" : "Coming Soon"}
          </CardTitle>
          <CardDescription>
            {upgradeMessage ??
              "Camera feeds and device management will be available in a future update. You will be able to view live streams and configure recording settings."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {upgradeMessage
            ? "This feature is gated by your subscription entitlements."
            : "This page is a placeholder for the cameras feature."}
        </CardContent>
      </Card>
    </>
  );
}

export default function CamerasPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Loading cameras…
            </CardContent>
          </Card>
        }
      >
        <CamerasContent />
      </Suspense>
    </div>
  );
}
