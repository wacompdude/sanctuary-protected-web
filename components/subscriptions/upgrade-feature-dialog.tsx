"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalOverlayClasses, modalPanelClasses } from "@/components/ui/modal";
import type { FeatureLockSummary } from "@/lib/subscriptions/feature-access";

export function UpgradeFeatureDialog({
  lock,
  open,
  onClose,
  plansHref = "/settings/plans",
}: {
  lock: FeatureLockSummary | null;
  open: boolean;
  onClose: () => void;
  plansHref?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !lock) return null;

  return (
    <div
      className={modalOverlayClasses("z-[80]")}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-feature-title"
        aria-describedby="upgrade-feature-description"
        className={modalPanelClasses()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-muted p-2">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="upgrade-feature-title"
              className="text-lg font-semibold tracking-tight"
            >
              {lock.title}
            </h2>
            <p
              id="upgrade-feature-description"
              className="mt-2 text-sm text-muted-foreground"
            >
              {lock.longMessage}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Current plan
            </dt>
            <dd className="mt-1 font-medium">
              {lock.currentPlanName ?? "Not configured"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Minimum required plan
            </dt>
            <dd className="mt-1 font-medium">
              {lock.minimumPlanName
                ? `${lock.minimumPlanName} or higher`
                : "A higher plan"}
            </dd>
          </div>
        </dl>

        {lock.benefits.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium">Upgrade to gain access to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {lock.benefits.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button asChild>
            <Link href={plansHref} onClick={onClose}>
              View plans
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
