"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  labelForMedicalSupplyCategory,
} from "@/lib/medical-supplies/constants";
import {
  isLowStock,
  type MedicalSupply,
} from "@/lib/medical-supplies/types";
import { cn } from "@/lib/utils";

export function MedicalSupplyTable({
  items,
  canManage,
}: {
  items: MedicalSupply[];
  canManage: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No medical supplies yet.
        {canManage && " Use Add supply to start your inventory."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Name</th>
            <th className="pb-3 pr-4 font-medium">Category</th>
            <th className="pb-3 pr-4 font-medium">On hand</th>
            <th className="pb-3 pr-4 font-medium">Minimum</th>
            <th className="pb-3 pr-4 font-medium">Location</th>
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const low = isLowStock(item);
            return (
              <tr
                key={item.id}
                className={cn(
                  "border-b border-border last:border-0",
                  item.archived_at && "opacity-60",
                )}
              >
                <td className="py-3 pr-4 align-top">
                  <Link
                    href={`/medical-supplies/${item.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="py-3 pr-4 align-top text-muted-foreground">
                  {labelForMedicalSupplyCategory(item.category)}
                </td>
                <td className="py-3 pr-4 align-top tabular-nums">
                  {item.quantity_on_hand} {item.unit}
                </td>
                <td className="py-3 pr-4 align-top tabular-nums text-muted-foreground">
                  {item.minimum_quantity} {item.unit}
                </td>
                <td className="py-3 pr-4 align-top text-muted-foreground">
                  {item.location_name || "—"}
                </td>
                <td className="py-3 align-top">
                  {item.archived_at ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : low ? (
                    <Badge variant="destructive">Reorder</Badge>
                  ) : (
                    <Badge variant="default">OK</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
