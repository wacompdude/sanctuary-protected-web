"use client";

import { useId, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { UpgradeFeatureDialog } from "@/components/subscriptions/upgrade-feature-dialog";
import type { FeatureLockSummary } from "@/lib/subscriptions/feature-access";

export function TierLockedControl({
  lock,
  className,
  children,
}: {
  lock: FeatureLockSummary;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-2 rounded-md text-left text-sm text-muted-foreground opacity-80",
          "cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-disabled="true"
        aria-describedby={descriptionId}
        title={lock.shortMessage}
        onClick={() => setOpen(true)}
      >
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{children}</span>
      </button>
      <span id={descriptionId} className="sr-only">
        {lock.longMessage}
      </span>
      <UpgradeFeatureDialog
        lock={lock}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
