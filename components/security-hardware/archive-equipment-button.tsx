"use client";

import { useTransition } from "react";
import {
  archiveSecurityEquipment,
  restoreSecurityEquipment,
} from "@/app/(app)/security-hardware/actions";
import { Button } from "@/components/ui/button";

export function ArchiveEquipmentButton({
  equipmentId,
  archived,
}: {
  equipmentId: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={archived ? "outline" : "destructive"}
      disabled={pending}
      onClick={() => {
        const confirmed = window.confirm(
          archived
            ? "Restore this equipment to the active inventory?"
            : "Archive this equipment? It will remain in history and will not be permanently deleted.",
        );
        if (!confirmed) return;
        startTransition(async () => {
          if (archived) {
            await restoreSecurityEquipment(equipmentId);
          } else {
            await archiveSecurityEquipment(equipmentId);
          }
        });
      }}
    >
      {pending
        ? archived
          ? "Restoring…"
          : "Archiving…"
        : archived
          ? "Restore equipment"
          : "Archive equipment"}
    </Button>
  );
}
