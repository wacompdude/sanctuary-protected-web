import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { FeatureLockedPage } from "@/components/subscriptions/feature-locked-page";
import type { FeatureKey } from "@/lib/subscriptions/feature-keys";
import { FEATURE_DISPLAY_NAMES } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";

export async function FeatureRouteGate({
  featureKey,
  children,
}: {
  featureKey: FeatureKey;
  children: React.ReactNode;
}) {
  const { church } = await getAuthenticatedUserWithChurch();
  const access = await hasFeature({
    organizationId: church.id,
    featureKey,
  });

  if (access.allowed) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {FEATURE_DISPLAY_NAMES[featureKey] ?? "Upgrade required"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          This module is not included with your current plan.
        </p>
      </div>
      <FeatureLockedPage access={access} />
    </div>
  );
}
