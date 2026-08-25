import { Check, Lock } from "lucide-react";
import type { PlanComparisonRow } from "@/lib/subscriptions/catalog";
import type { SubscriptionPlanRecord } from "@/lib/subscriptions/types";

export function PlanComparisonTable({
  plans,
  rows,
  currentPlanKey,
}: {
  plans: SubscriptionPlanRecord[];
  rows: PlanComparisonRow[];
  currentPlanKey?: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Feature</th>
            {plans.map((plan) => (
              <th key={plan.id} className="px-3 py-2 font-medium">
                {plan.display_name}
                {currentPlanKey && String(plan.plan_key) === currentPlanKey ? (
                  <span className="ml-2 text-xs text-foreground">Current</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.featureKey} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="font-medium">{row.displayName}</div>
                {row.valueType !== "boolean" ? (
                  <div className="text-xs text-muted-foreground">Limit</div>
                ) : null}
              </td>
              {plans.map((plan) => {
                const cell = row.cells[String(plan.plan_key)];
                const included = Boolean(cell?.included);
                return (
                  <td key={`${row.featureKey}-${plan.id}`} className="px-3 py-2">
                    {row.valueType === "integer" ? (
                      cell?.unlimited ? (
                        "Unlimited"
                      ) : included ? (
                        String(cell?.limit ?? 0)
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" aria-hidden />
                          Locked
                        </span>
                      )
                    ) : included ? (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <Check className="h-4 w-4" aria-hidden />
                        Included
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" aria-hidden />
                        Locked
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
