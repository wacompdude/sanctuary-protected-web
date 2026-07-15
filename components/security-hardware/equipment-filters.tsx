import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CRITICALITIES,
  EQUIPMENT_STATUSES,
} from "@/lib/security-hardware/constants";
import type { CampusOption } from "@/lib/security-hardware/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EquipmentFilters({
  campuses,
  values,
}: {
  campuses: CampusOption[];
  values: {
    q?: string;
    category?: string;
    status?: string;
    campusId?: string;
    criticality?: string;
    includeArchived?: boolean;
    maintenanceDue?: boolean;
    warrantyExpiring?: boolean;
    replacementDue?: boolean;
    unassigned?: boolean;
    criticalOnly?: boolean;
  };
}) {
  return (
    <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" method="get">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          defaultValue={values.q ?? ""}
          placeholder="Name, asset tag, model, serial…"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          defaultValue={values.category ?? ""}
          className={selectClassName}
        >
          <option value="">All categories</option>
          {EQUIPMENT_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          defaultValue={values.status ?? ""}
          className={selectClassName}
        >
          <option value="">All statuses</option>
          {EQUIPMENT_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="campusId">Campus</Label>
        <select
          id="campusId"
          name="campusId"
          defaultValue={values.campusId ?? ""}
          className={selectClassName}
        >
          <option value="">All campuses</option>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="criticality">Criticality</Label>
        <select
          id="criticality"
          name="criticality"
          defaultValue={values.criticality ?? ""}
          className={selectClassName}
        >
          <option value="">All levels</option>
          {EQUIPMENT_CRITICALITIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-4 md:col-span-2 xl:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includeArchived"
            value="1"
            defaultChecked={values.includeArchived}
          />
          Include archived
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="maintenanceDue"
            value="1"
            defaultChecked={values.maintenanceDue}
          />
          Maintenance due
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="warrantyExpiring"
            value="1"
            defaultChecked={values.warrantyExpiring}
          />
          Warranty expiring
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="replacementDue"
            value="1"
            defaultChecked={values.replacementDue}
          />
          Replacement due
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="unassigned"
            value="1"
            defaultChecked={values.unassigned}
          />
          Unassigned
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="criticalOnly"
            value="1"
            defaultChecked={values.criticalOnly}
          />
          High / critical only
        </label>
      </div>

      <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/security-hardware">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
