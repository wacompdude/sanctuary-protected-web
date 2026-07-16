"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MedicalSupply } from "@/lib/medical-supplies/types";
import { Plus, Trash2 } from "lucide-react";
import { selectClassName } from "@/components/incidents/incident-badges";

type UsageRow = {
  key: string;
  supplyId: string;
  quantity: string;
};

export function MedicalSuppliesUsedFields({
  supplies,
}: {
  supplies: MedicalSupply[];
}) {
  const [rows, setRows] = useState<UsageRow[]>([
    { key: "1", supplyId: "", quantity: "1" },
  ]);

  if (supplies.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        No medical supplies with quantity on hand. Add items under{" "}
        <strong>Medical supplies</strong> first, then you can record usage here
        or on the incident detail page.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium">Medical supplies used</p>
        <p className="text-xs text-muted-foreground">
          Optional. Inventory is reduced when this medical incident is saved.
        </p>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.key}
          className="grid gap-3 sm:grid-cols-[1fr_7rem_auto]"
        >
          <div className="space-y-1">
            {index === 0 && <Label>Supply</Label>}
            <select
              name="medical_supply_ids"
              value={row.supplyId}
              onChange={(event) => {
                const value = event.target.value;
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key
                      ? { ...item, supplyId: value }
                      : item,
                  ),
                );
              }}
              className={selectClassName}
            >
              <option value="">None</option>
              {supplies.map((supply) => (
                <option key={supply.id} value={supply.id}>
                  {supply.name} ({supply.quantity_on_hand} {supply.unit} on hand)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            {index === 0 && <Label>Qty</Label>}
            <Input
              name="medical_supply_quantities"
              type="number"
              min={1}
              value={row.quantity}
              onChange={(event) => {
                const value = event.target.value;
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key
                      ? { ...item, quantity: value }
                      : item,
                  ),
                );
              }}
              disabled={!row.supplyId}
            />
          </div>
          <div className={index === 0 ? "pt-6" : ""}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10"
              aria-label="Remove supply row"
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) =>
                  current.filter((item) => item.key !== row.key),
                )
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setRows((current) => [
            ...current,
            { key: String(Date.now()), supplyId: "", quantity: "1" },
          ])
        }
      >
        <Plus className="h-4 w-4" />
        Add another supply
      </Button>
    </div>
  );
}
