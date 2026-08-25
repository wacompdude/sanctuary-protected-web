import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FEATURE_BENEFITS } from "@/lib/subscriptions/feature-access";
import { FEATURE_DISPLAY_NAMES } from "@/lib/subscriptions/feature-keys";
import type { FeatureAccessResult } from "@/lib/subscriptions/types";

export function FeatureLockedPage({
  access,
  plansHref = "/settings/plans",
}: {
  access: FeatureAccessResult;
  plansHref?: string;
}) {
  const benefits = FEATURE_BENEFITS[access.featureKey] ?? [];
  const title =
    FEATURE_DISPLAY_NAMES[access.featureKey] ?? "This feature";

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-muted p-2">
            <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-2 max-w-xl">
              {access.reason ??
                access.upgradeMessage ??
                "This feature is not included with your current plan."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border px-3 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Current plan
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {access.planDisplayName ?? "Not configured"}
            </dd>
          </div>
          <div className="rounded-md border border-border px-3 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Minimum required plan
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {access.minimumPlanDisplayName
                ? `${access.minimumPlanDisplayName} or higher`
                : "A higher plan"}
            </dd>
          </div>
        </dl>
        {benefits.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        ) : null}
        <Button asChild variant="outline">
          <Link href={plansHref}>View plans</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
