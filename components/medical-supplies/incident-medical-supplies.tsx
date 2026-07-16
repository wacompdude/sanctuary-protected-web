"use client";

import { useActionState, useEffect, useTransition } from "react";
import {
  recordMedicalSupplyUsage,
  removeMedicalSupplyUsage,
} from "@/app/(app)/medical-supplies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MedicalSupply } from "@/lib/medical-supplies/types";
import type { MedicalSupplyUsage } from "@/lib/medical-supplies/types";
import type { MedicalSupplyActionState } from "@/lib/medical-supplies/types";
import { Trash2 } from "lucide-react";

const initialState: MedicalSupplyActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RemoveUsageButton({
  usageId,
  incidentId,
  canRemove,
}: {
  usageId: string;
  incidentId: string;
  canRemove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (!canRemove) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      disabled={pending}
      aria-label="Remove usage"
      onClick={() => {
        startTransition(async () => {
          await removeMedicalSupplyUsage(usageId, incidentId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function IncidentMedicalSuppliesCard({
  incidentId,
  usages,
  supplies,
  canRecord,
  canManage,
}: {
  incidentId: string;
  usages: MedicalSupplyUsage[];
  supplies: MedicalSupply[];
  canRecord: boolean;
  canManage: boolean;
}) {
  const boundRecord = recordMedicalSupplyUsage.bind(null, incidentId);
  const [state, formAction, pending] = useActionState(boundRecord, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `incident-medical-supplies-form-${incidentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, incidentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medical supplies used</CardTitle>
        <CardDescription>
          Record consumable supplies used during this medical incident. Inventory
          is updated automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {usages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No supplies recorded for this incident yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {usages.map((usage) => (
              <li
                key={usage.id}
                className="flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{usage.supply_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {usage.quantity_used} {usage.supply_unit}
                    {usage.notes ? ` · ${usage.notes}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(usage.created_at).toLocaleString()}
                  </p>
                </div>
                <RemoveUsageButton
                  usageId={usage.id}
                  incidentId={incidentId}
                  canRemove={canManage}
                />
              </li>
            ))}
          </ul>
        )}

        {canRecord && (
          <form
            id={`incident-medical-supplies-form-${incidentId}`}
            action={formAction}
            className="space-y-4 border-t border-border pt-4"
          >
            {state.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            {state.success && (
              <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                Supply usage recorded.
              </p>
            )}

            {supplies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No supplies with quantity on hand. Add items in Medical Supplies
                inventory first.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`supply-${incidentId}`}>Supply</Label>
                    <select
                      id={`supply-${incidentId}`}
                      name="medical_supply_id"
                      required
                      defaultValue=""
                      className={selectClassName}
                    >
                      <option value="" disabled>
                        Select supply…
                      </option>
                      {supplies.map((supply) => (
                        <option key={supply.id} value={supply.id}>
                          {supply.name} ({supply.quantity_on_hand} {supply.unit}{" "}
                          on hand)
                        </option>
                      ))}
                    </select>
                    {state.fieldErrors?.medical_supply_id && (
                      <p className="text-sm text-destructive">
                        {state.fieldErrors.medical_supply_id}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`qty-${incidentId}`}>Quantity used</Label>
                    <Input
                      id={`qty-${incidentId}`}
                      name="quantity_used"
                      type="number"
                      min={1}
                      required
                      aria-invalid={!!state.fieldErrors?.quantity_used}
                    />
                    {state.fieldErrors?.quantity_used && (
                      <p className="text-sm text-destructive">
                        {state.fieldErrors.quantity_used}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`notes-${incidentId}`}>Notes (optional)</Label>
                  <textarea
                    id={`notes-${incidentId}`}
                    name="notes"
                    className={textareaClassName}
                    maxLength={2000}
                  />
                </div>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Record supply usage"}
                </Button>
              </>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
