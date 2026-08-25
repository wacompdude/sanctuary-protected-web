import { Suspense } from "react";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { FeatureLockedPage } from "@/components/subscriptions/feature-locked-page";
import type { FeatureKey } from "@/lib/subscriptions/feature-keys";
import { FEATURE_DISPLAY_NAMES } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";

function FeatureRouteGateFallback() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted/40" />
      <div className="h-32 animate-pulse rounded-md bg-muted/40" />
    </div>
  );
}

async function FeatureRouteGateInner({
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

export function FeatureRouteGate({
  featureKey,
  children,
}: {
  featureKey: FeatureKey;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<FeatureRouteGateFallback />}>
      <FeatureRouteGateInner featureKey={featureKey}>
        {children}
      </FeatureRouteGateInner>
    </Suspense>
  );
}
