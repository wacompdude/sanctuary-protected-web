import Link from "next/link";
import {
  EquipmentCriticalityBadge,
  EquipmentStatusBadge,
} from "@/components/security-hardware/equipment-badges";
import { Button } from "@/components/ui/button";
import {
  formatEquipmentDate,
  labelForEquipmentCategory,
} from "@/lib/security-hardware/constants";
import type { SecurityEquipment } from "@/lib/security-hardware/types";

export function EquipmentTable({
  items,
  canManage,
}: {
  items: SecurityEquipment[];
  canManage: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <p>No equipment matches these filters.</p>
        {canManage && (
          <Button asChild className="mt-4" variant="outline">
            <Link href="/security-hardware/new">Add the first item</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Asset tag
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Name
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Category
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Campus
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Location
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Status
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Criticality
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Assigned
              </th>
              <th className="pb-3 pr-4 font-medium text-muted-foreground">
                Next maintenance
              </th>
              <th className="pb-3 font-medium text-muted-foreground">
                Warranty
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/60">
                <td className="py-3 pr-4 font-mono text-xs">
                  <Link
                    href={`/security-hardware/${item.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.asset_tag || "—"}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <Link
                    href={`/security-hardware/${item.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.name}
                  </Link>
                  {item.archived_at && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (archived)
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {labelForEquipmentCategory(item.category)}
                </td>
                <td className="py-3 pr-4">{item.campus_name || "—"}</td>
                <td className="py-3 pr-4">{item.location_name || "—"}</td>
                <td className="py-3 pr-4">
                  <EquipmentStatusBadge status={item.status} />
                </td>
                <td className="py-3 pr-4">
                  <EquipmentCriticalityBadge criticality={item.criticality} />
                </td>
                <td className="py-3 pr-4">{item.assigned_team || "—"}</td>
                <td className="py-3 pr-4">
                  {formatEquipmentDate(item.next_maintenance_at)}
                </td>
                <td className="py-3">
                  {formatEquipmentDate(item.warranty_expiration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-md border border-border p-3"
          >
            <Link href={`/security-hardware/${item.id}`} className="block space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.asset_tag || "No asset tag"}
                  </p>
                </div>
                <EquipmentStatusBadge status={item.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {labelForEquipmentCategory(item.category)}
                {item.campus_name ? ` · ${item.campus_name}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <EquipmentCriticalityBadge criticality={item.criticality} />
                <span className="text-xs text-muted-foreground">
                  Maint. {formatEquipmentDate(item.next_maintenance_at)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
