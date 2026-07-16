"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createMedicalSupply,
  updateMedicalSupply,
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
import {
  MEDICAL_SUPPLY_CATEGORIES,
  MEDICAL_SUPPLY_UNITS,
} from "@/lib/medical-supplies/constants";
import type {
  MedicalSupply,
  MedicalSupplyActionState,
} from "@/lib/medical-supplies/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MedicalSupplyForm({
  supply,
}: {
  supply?: MedicalSupply;
}) {
  const action = supply
    ? updateMedicalSupply.bind(null, supply.id)
    : createMedicalSupply;
  const [state, formAction, pending] = useActionState(
    action,
    {} as MedicalSupplyActionState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{supply ? "Edit supply" : "Add medical supply"}</CardTitle>
        <CardDescription>
          Track consumable medical items, on-hand quantity, and reorder minimums.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Supply saved.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={supply?.name ?? ""}
              required
              aria-invalid={!!state.fieldErrors?.name}
            />
            {state.fieldErrors?.name && (
              <p className="text-sm text-destructive">{state.fieldErrors.name}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                name="category"
                defaultValue={supply?.category ?? "other"}
                className={selectClassName}
              >
                {MEDICAL_SUPPLY_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <select
                id="unit"
                name="unit"
                defaultValue={supply?.unit ?? "each"}
                className={selectClassName}
              >
                {MEDICAL_SUPPLY_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity_on_hand">Quantity on hand</Label>
              <Input
                id="quantity_on_hand"
                name="quantity_on_hand"
                type="number"
                min={0}
                defaultValue={supply?.quantity_on_hand ?? 0}
                aria-invalid={!!state.fieldErrors?.quantity_on_hand}
              />
              {state.fieldErrors?.quantity_on_hand && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.quantity_on_hand}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="minimum_quantity">Minimum on hand (reorder at)</Label>
              <Input
                id="minimum_quantity"
                name="minimum_quantity"
                type="number"
                min={0}
                defaultValue={supply?.minimum_quantity ?? 0}
                aria-invalid={!!state.fieldErrors?.minimum_quantity}
              />
              {state.fieldErrors?.minimum_quantity && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.minimum_quantity}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location_name">Storage location</Label>
              <Input
                id="location_name"
                name="location_name"
                defaultValue={supply?.location_name ?? ""}
                placeholder="e.g. North lobby first-aid cabinet"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU / item code</Label>
              <Input id="sku" name="sku" defaultValue={supply?.sku ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendor_name">Preferred vendor</Label>
            <Input
              id="vendor_name"
              name="vendor_name"
              defaultValue={supply?.vendor_name ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              className={textareaClassName}
              defaultValue={supply?.notes ?? ""}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : supply ? "Save changes" : "Add supply"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href={supply ? `/medical-supplies/${supply.id}` : "/medical-supplies"}>
                Cancel
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
