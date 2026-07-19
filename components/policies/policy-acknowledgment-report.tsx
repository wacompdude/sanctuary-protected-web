"use client";

import { useActionState, useState, useTransition } from "react";
import {
  runAssignPolicyAcknowledgments,
  waivePolicyAcknowledgment,
} from "@/app/(app)/policies/acknowledgment-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { labelForPolicyAcknowledgmentStatus } from "@/lib/policies/constants";
import type { PolicyAcknowledgmentReport } from "@/lib/policies/types";
import type { ActionState } from "@/lib/church/types";

const initialState: ActionState = {};

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function WaiveForm({ acknowledgmentId }: { acknowledgmentId: string }) {
  const bound = waivePolicyAcknowledgment.bind(null, acknowledgmentId);
  const [state, formAction, pending] = useActionState(bound, initialState);

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <Label htmlFor={`waiver-${acknowledgmentId}`} className="sr-only">
        Waiver reason
      </Label>
      <textarea
        id={`waiver-${acknowledgmentId}`}
        name="waiver_reason"
        required
        className={textareaClassName}
        placeholder="Reason for waiver"
      />
      {state.fieldErrors?.waiver_reason ? (
        <p className="text-xs text-destructive">
          {state.fieldErrors.waiver_reason}
        </p>
      ) : null}
      {state.error ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Waiving…" : "Waive"}
      </Button>
    </form>
  );
}

export function PolicyAcknowledgmentReportCard({
  policyId,
  report,
  canManage,
  requiresAcknowledgment,
  timeZone,
}: {
  policyId: string;
  report: PolicyAcknowledgmentReport;
  canManage: boolean;
  requiresAcknowledgment: boolean;
  timeZone?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [assignMessage, setAssignMessage] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Acknowledgment report</CardTitle>
            <CardDescription>
              {report.total} assigned · {report.acknowledged} done ·{" "}
              {report.pending} pending · {report.overdue} overdue ·{" "}
              {report.waived} waived
            </CardDescription>
          </div>
          {canManage && requiresAcknowledgment ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await runAssignPolicyAcknowledgments(policyId);
                  setAssignMessage(
                    result.error
                      ? result.error
                      : result.success
                        ? "Assignments refreshed."
                        : "Unable to assign.",
                  );
                });
              }}
            >
              {pending ? "Assigning…" : "Assign / refresh"}
            </Button>
          ) : null}
        </div>
        {assignMessage ? (
          <p className="text-sm text-muted-foreground">{assignMessage}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {report.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {requiresAcknowledgment
              ? "No acknowledgments assigned yet. Publish or use Assign / refresh."
              : "This policy does not require acknowledgment."}
          </p>
        ) : (
          <ul className="space-y-3">
            {report.items.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.user_display_name ?? "Member"}
                  </span>
                  <span className="text-muted-foreground">
                    {labelForPolicyAcknowledgmentStatus(
                      item.acknowledgment_status,
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Due{" "}
                  {item.due_at
                    ? formatChurchDateTime(item.due_at, { timeZone })
                    : "—"}
                  {item.acknowledged_at
                    ? ` · Acknowledged ${formatChurchDateTime(item.acknowledged_at, { timeZone })}`
                    : ""}
                </p>
                {canManage &&
                item.acknowledgment_status !== "acknowledged" &&
                item.acknowledgment_status !== "waived" ? (
                  <WaiveForm acknowledgmentId={item.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
