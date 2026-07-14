"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changeChurchAccountStatus } from "@/app/(app)/settings/church/actions";
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
import type { ChurchSettingsRecord } from "@/lib/church/settings";
import type { ActionState } from "@/lib/church/types";

function DangerAction({
  actionValue,
  title,
  description,
  churchName,
  buttonLabel,
  buttonVariant = "destructive",
}: {
  actionValue: "suspend" | "reactivate" | "close";
  title: string;
  description: string;
  churchName: string;
  buttonLabel: string;
  buttonVariant?: "destructive" | "outline";
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    changeChurchAccountStatus,
    {} as ActionState,
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <form
        action={formAction}
        className="space-y-3"
        onSubmit={(event) => {
          const form = event.currentTarget;
          const confirmName = new FormData(form).get("confirm_name");
          const ok = window.confirm(
            `Confirm ${buttonLabel.toLowerCase()} for "${churchName}"? Historical records will be preserved.`,
          );
          if (!ok) {
            event.preventDefault();
            return;
          }
          if (String(confirmName ?? "").trim() !== churchName) {
            event.preventDefault();
            window.alert("Type the exact church name to confirm.");
          }
        }}
      >
        <input type="hidden" name="account_action" value={actionValue} />
        <div className="space-y-2">
          <Label htmlFor={`confirm_name_${actionValue}`}>
            Type <span className="font-semibold">{churchName}</span> to confirm
          </Label>
          <Input
            id={`confirm_name_${actionValue}`}
            name="confirm_name"
            autoComplete="off"
            aria-invalid={!!state.fieldErrors?.confirm_name}
          />
          {state.fieldErrors?.confirm_name && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.confirm_name}
            </p>
          )}
        </div>
        {state.error && (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-sm text-green-700 dark:text-green-400">
            Account status updated.
          </p>
        )}
        <Button type="submit" variant={buttonVariant} disabled={pending}>
          {pending ? "Working…" : buttonLabel}
        </Button>
      </form>
    </div>
  );
}

export function ChurchDangerZone({
  church,
  isOwner,
}: {
  church: ChurchSettingsRecord;
  isOwner: boolean;
}) {
  if (!isOwner) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Only church owners can suspend, reactivate, or close the account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          These actions change account status only. Incidents, memberships,
          certifications, and audit history are preserved. Permanent deletion is
          not available.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {church.status !== "suspended" && church.status !== "closed" && (
          <DangerAction
            actionValue="suspend"
            title="Deactivate church account"
            description="Suspends the church so ordinary operational activity should stop while owners can recover access."
            churchName={church.name}
            buttonLabel="Suspend church account"
          />
        )}

        {church.status === "suspended" && (
          <DangerAction
            actionValue="reactivate"
            title="Reactivate church account"
            description="Restores an active status for this church."
            churchName={church.name}
            buttonLabel="Reactivate church account"
            buttonVariant="outline"
          />
        )}

        {church.status !== "closed" && (
          <DangerAction
            actionValue="close"
            title="Close church account"
            description="Marks the church as closed. Historical incidents, memberships, certifications, and audit logs are preserved. Permanent deletion is not available."
            churchName={church.name}
            buttonLabel="Close church account"
          />
        )}

        <div className="space-y-2 rounded-md border border-border p-4">
          <h3 className="font-medium">Transfer ownership</h3>
          <p className="text-sm text-muted-foreground">
            Ownership transfer is not implemented yet. When available, it will
            live on the Ownership settings page and require owner confirmation.
          </p>
          <Button type="button" variant="outline" disabled>
            Transfer ownership (coming soon)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
