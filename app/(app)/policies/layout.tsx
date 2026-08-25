import { FeatureRouteGate } from "@/components/subscriptions/feature-route-gate";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";

export default function PoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeatureRouteGate featureKey={FEATURE_KEYS.POLICIES}>
      {children}
    </FeatureRouteGate>
  );
}
