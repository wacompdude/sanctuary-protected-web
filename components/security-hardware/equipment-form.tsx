"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createSecurityEquipment,
  updateSecurityEquipment,
} from "@/app/(app)/security-hardware/actions";
import { CategoryDetailsFields } from "@/components/security-hardware/category-details-fields";
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
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CRITICALITIES,
  EQUIPMENT_STATUSES,
} from "@/lib/security-hardware/constants";
import type { CategoryDetailRecord } from "@/lib/security-hardware/category-details";
import type {
  CampusOption,
  EquipmentActionState,
  EquipmentCategory,
  SecurityEquipment,
} from "@/lib/security-hardware/types";
import { EquipmentPhotoPicker } from "@/components/security-hardware/equipment-photo-picker";

const initialState: EquipmentActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function dateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export function EquipmentForm({
  campuses,
  mode,
  equipment,
  categoryDetails,
}: {
  campuses: CampusOption[];
  mode: "create" | "edit";
  equipment?: SecurityEquipment;
  categoryDetails?: CategoryDetailRecord | null;
}) {
  const action =
    mode === "edit" && equipment
      ? updateSecurityEquipment.bind(null, equipment.id)
      : createSecurityEquipment;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [category, setCategory] = useState<EquipmentCategory | "">(
    equipment?.category ?? "",
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Equipment saved.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Equipment type</CardTitle>
          <CardDescription>
            Category, name, status, and criticality.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              required
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as EquipmentCategory | "")
              }
              className={selectClassName}
            >
              <option value="" disabled>
                Select category
              </option>
              {EQUIPMENT_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.category} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subcategory">Subcategory</Label>
            <Input
              id="subcategory"
              name="subcategory"
              defaultValue={equipment?.subcategory ?? ""}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={equipment?.name ?? ""}
              placeholder="e.g. North Lobby Dome Camera"
            />
            <FieldError message={state.fieldErrors?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              required
              defaultValue={equipment?.status ?? "planned"}
              className={selectClassName}
            >
              {EQUIPMENT_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.status} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="criticality">Criticality</Label>
            <select
              id="criticality"
              name="criticality"
              required
              defaultValue={equipment?.criticality ?? "medium"}
              className={selectClassName}
            >
              {EQUIPMENT_CRITICALITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.criticality} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              className={textareaClassName}
              defaultValue={equipment?.description ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Location</CardTitle>
          <CardDescription>Campus and physical placement.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="campus_id">Campus</Label>
            <select
              id="campus_id"
              name="campus_id"
              defaultValue={equipment?.campus_id ?? ""}
              className={selectClassName}
            >
              <option value="">No campus selected</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.campus_id} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location_name">Location name</Label>
            <Input
              id="location_name"
              name="location_name"
              defaultValue={equipment?.location_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="building">Building</Label>
            <Input
              id="building"
              name="building"
              defaultValue={equipment?.building ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="floor">Floor</Label>
            <Input
              id="floor"
              name="floor"
              defaultValue={equipment?.floor ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room">Room</Label>
            <Input id="room" name="room" defaultValue={equipment?.room ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="installation_area">Installation area</Label>
            <Input
              id="installation_area"
              name="installation_area"
              defaultValue={equipment?.installation_area ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Asset information</CardTitle>
          <CardDescription>Identifiers, purchase, and warranty.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="asset_tag">Asset tag</Label>
            <Input
              id="asset_tag"
              name="asset_tag"
              defaultValue={equipment?.asset_tag ?? ""}
              placeholder={
                mode === "create" ? "Leave blank to auto-generate" : ""
              }
            />
            <FieldError message={state.fieldErrors?.asset_tag} />
            {mode === "create" && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name="auto_asset_tag"
                  value="on"
                  defaultChecked
                />
                Auto-generate asset tag if blank
              </label>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="manufacturer">Manufacturer</Label>
            <Input
              id="manufacturer"
              name="manufacturer"
              defaultValue={equipment?.manufacturer ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              name="model"
              defaultValue={equipment?.model ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serial_number">Serial number</Label>
            <Input
              id="serial_number"
              name="serial_number"
              defaultValue={equipment?.serial_number ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purchase_date">Purchase date</Label>
            <Input
              id="purchase_date"
              name="purchase_date"
              type="date"
              defaultValue={dateInputValue(equipment?.purchase_date)}
            />
            <FieldError message={state.fieldErrors?.purchase_date} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purchase_price">Purchase price</Label>
            <Input
              id="purchase_price"
              name="purchase_price"
              inputMode="decimal"
              defaultValue={
                equipment?.purchase_price != null
                  ? String(equipment.purchase_price)
                  : ""
              }
            />
            <FieldError message={state.fieldErrors?.purchase_price} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor_name">Vendor</Label>
            <Input
              id="vendor_name"
              name="vendor_name"
              defaultValue={equipment?.vendor_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor_contact">Vendor contact</Label>
            <Input
              id="vendor_contact"
              name="vendor_contact"
              defaultValue={equipment?.vendor_contact ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="warranty_expiration">Warranty expiration</Label>
            <Input
              id="warranty_expiration"
              name="warranty_expiration"
              type="date"
              defaultValue={dateInputValue(equipment?.warranty_expiration)}
            />
            <FieldError message={state.fieldErrors?.warranty_expiration} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="installed_date">Installed date</Label>
            <Input
              id="installed_date"
              name="installed_date"
              type="date"
              defaultValue={dateInputValue(equipment?.installed_date)}
            />
            <FieldError message={state.fieldErrors?.installed_date} />
          </div>
        </CardContent>
      </Card>

      {category ? (
        <CategoryDetailsFields
          key={category}
          category={category}
          values={
            equipment?.category === category ? (categoryDetails ?? null) : null
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>4. Technical details</CardTitle>
            <CardDescription>
              Select a category above to show category-specific fields.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>5. Assignment and maintenance</CardTitle>
          <CardDescription>
            Team assignment and upcoming inspection or maintenance dates.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="assigned_team">Assigned team</Label>
            <Input
              id="assigned_team"
              name="assigned_team"
              defaultValue={equipment?.assigned_team ?? ""}
              placeholder="e.g. Sunday security team"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next_inspection_at">Next inspection</Label>
            <Input
              id="next_inspection_at"
              name="next_inspection_at"
              type="date"
              defaultValue={dateInputValue(equipment?.next_inspection_at)}
            />
            <FieldError message={state.fieldErrors?.next_inspection_at} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next_maintenance_at">Next maintenance</Label>
            <Input
              id="next_maintenance_at"
              name="next_maintenance_at"
              type="date"
              defaultValue={dateInputValue(equipment?.next_maintenance_at)}
            />
            <FieldError message={state.fieldErrors?.next_maintenance_at} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expected_replacement_date">
              Expected replacement date
            </Label>
            <Input
              id="expected_replacement_date"
              name="expected_replacement_date"
              type="date"
              defaultValue={dateInputValue(equipment?.expected_replacement_date)}
            />
            <FieldError message={state.fieldErrors?.expected_replacement_date} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replacement_cost_estimate">
              Replacement cost estimate
            </Label>
            <Input
              id="replacement_cost_estimate"
              name="replacement_cost_estimate"
              inputMode="decimal"
              defaultValue={
                equipment?.replacement_cost_estimate != null
                  ? String(equipment.replacement_cost_estimate)
                  : ""
              }
            />
            <FieldError message={state.fieldErrors?.replacement_cost_estimate} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              className={textareaClassName}
              defaultValue={equipment?.notes ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      {mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
            <CardDescription>
              Optional photos of the equipment. You can add more documents later
              from the equipment detail page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EquipmentPhotoPicker error={state.fieldErrors?.photos} />
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Save equipment"
              : "Update equipment"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={
              mode === "edit" && equipment
                ? `/security-hardware/${equipment.id}`
                : "/security-hardware"
            }
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
