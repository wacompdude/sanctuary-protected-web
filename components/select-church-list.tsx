"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchActiveChurch } from "@/app/(app)/church/actions";
import { Button } from "@/components/ui/button";
import { labelForMembershipRole } from "@/lib/church/invitations";
import { Check } from "lucide-react";

export type SelectableChurch = {
  id: string;
  name: string;
  role: string;
};

export function SelectChurchList({
  churches,
  activeChurchId,
}: {
  churches: SelectableChurch[];
  activeChurchId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (churches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not a member of any church yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {churches.map((church) => {
        const isActive = church.id === activeChurchId;
        return (
          <li
            key={church.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{church.name}</p>
              <p className="text-sm text-muted-foreground">
                {labelForMembershipRole(church.role)}
                {isActive ? " · currently selected" : ""}
              </p>
            </div>
            {isActive ? (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="h-4 w-4" />
                Active
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const formData = new FormData();
                  formData.set("church_id", church.id);
                  startTransition(async () => {
                    const result = await switchActiveChurch({}, formData);
                    if (result.error) {
                      window.alert(result.error);
                      return;
                    }
                    router.push("/dashboard");
                    router.refresh();
                  });
                }}
              >
                {pending ? "Switching…" : "Switch to this church"}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
