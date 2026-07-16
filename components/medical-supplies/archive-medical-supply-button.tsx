"use client";

import { useTransition } from "react";
import {
  archiveMedicalSupply,
  restoreMedicalSupply,
} from "@/app/(app)/medical-supplies/actions";
import { Button } from "@/components/ui/button";

export function ArchiveMedicalSupplyButton({
  supplyId,
  archived,
}: {
  supplyId: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const action = archived ? restoreMedicalSupply : archiveMedicalSupply;
        if (!archived) {
          const ok = window.confirm(
            "Archive this supply? It will be hidden from active inventory.",
          );
          if (!ok) return;
        }
        startTransition(async () => {
          await action(supplyId);
        });
      }}
    >
      {pending ? "Saving…" : archived ? "Restore" : "Archive"}
    </Button>
  );
}
