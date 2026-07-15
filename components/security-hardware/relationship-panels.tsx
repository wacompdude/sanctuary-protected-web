"use client";

import { useActionState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  addEquipmentRelationship,
  removeEquipmentRelationship,
} from "@/app/(app)/security-hardware/media-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RELATIONSHIP_TYPES,
  labelForRelationshipType,
  type EquipmentRelationship,
  type MediaActionState,
} from "@/lib/security-hardware/attachments";
import { labelForEquipmentCategory } from "@/lib/security-hardware/constants";
import { Trash2 } from "lucide-react";

const initialState: MediaActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RemoveRelationshipButton({
  relationshipId,
  equipmentId,
  canManage,
}: {
  relationshipId: string;
  equipmentId: string;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      disabled={pending}
      aria-label="Remove relationship"
      onClick={() => {
        startTransition(async () => {
          await removeEquipmentRelationship(relationshipId, equipmentId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function EquipmentRelationshipsCard({
  equipmentId,
  relationships,
  options,
  canManage,
}: {
  equipmentId: string;
  relationships: EquipmentRelationship[];
  options: { id: string; label: string }[];
  canManage: boolean;
}) {
  const boundAdd = addEquipmentRelationship.bind(null, equipmentId);
  const [state, formAction, pending] = useActionState(boundAdd, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `equipment-relationships-form-${equipmentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, equipmentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Related equipment</CardTitle>
        <CardDescription>
          Link cameras to NVRs, radios to gateways, sensors to controllers, and
          other hardware relationships.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No related equipment yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {relationships.map((relationship) => (
              <li
                key={relationship.id}
                className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium">
                    {relationship.direction === "outbound"
                      ? labelForRelationshipType(relationship.relationship_type)
                      : `${labelForRelationshipType(relationship.relationship_type)} (incoming)`}
                  </p>
                  <Link
                    href={`/security-hardware/${relationship.related_equipment_id}`}
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    {relationship.related_asset_tag
                      ? `${relationship.related_asset_tag} · `
                      : ""}
                    {relationship.related_name}
                  </Link>
                  {relationship.related_category && (
                    <p className="text-xs text-muted-foreground">
                      {labelForEquipmentCategory(relationship.related_category)}
                    </p>
                  )}
                  {relationship.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {relationship.notes}
                    </p>
                  )}
                </div>
                <RemoveRelationshipButton
                  relationshipId={relationship.id}
                  equipmentId={equipmentId}
                  canManage={canManage}
                />
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form
            id={`equipment-relationships-form-${equipmentId}`}
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
                Relationship added.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor={`related-${equipmentId}`}>Related equipment</Label>
              <select
                id={`related-${equipmentId}`}
                name="related_equipment_id"
                required
                defaultValue=""
                className={selectClassName}
              >
                <option value="" disabled>
                  Select equipment…
                </option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.related_equipment_id && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.related_equipment_id}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`type-${equipmentId}`}>Relationship</Label>
                <select
                  id={`type-${equipmentId}`}
                  name="relationship_type"
                  defaultValue="connected_to"
                  className={selectClassName}
                >
                  {RELATIONSHIP_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`direction-${equipmentId}`}>Direction</Label>
                <select
                  id={`direction-${equipmentId}`}
                  name="direction"
                  defaultValue="outbound"
                  className={selectClassName}
                >
                  <option value="outbound">This item → related</option>
                  <option value="inbound">Related → this item</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`notes-${equipmentId}`}>Notes (optional)</Label>
              <textarea
                id={`notes-${equipmentId}`}
                name="notes"
                className={textareaClassName}
                maxLength={2000}
              />
            </div>
            <Button type="submit" disabled={pending || options.length === 0}>
              {pending ? "Saving…" : "Add relationship"}
            </Button>
            {options.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add more equipment to the inventory before linking relationships.
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
