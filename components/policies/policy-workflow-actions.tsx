"use client";

import { useActionState, useState, useTransition } from "react";
import {
  approvePolicy,
  archivePolicy,
  publishPolicy,
  requestPolicyChanges,
  restorePolicy,
  retirePolicy,
  startPolicyRevision,
  submitPolicyForReview,
} from "@/app/(app)/policies/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  PolicyActionState,
  PolicyDocumentStatus,
  PolicyWorkflowAction,
} from "@/lib/policies/types";
import {
  allowedWorkflowActions,
  labelForWorkflowAction,
} from "@/lib/policies/workflow";

const initialState: PolicyActionState = {};

const textareaClassName =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function WorkflowForm({
  policyId,
  action,
  notesRequired,
  notesLabel,
}: {
  policyId: string;
  action: Extract<
    PolicyWorkflowAction,
    "submit" | "request_changes" | "approve" | "publish"
  >;
  notesRequired?: boolean;
  notesLabel?: string;
}) {
  const bound =
    action === "submit"
      ? submitPolicyForReview.bind(null, policyId)
      : action === "request_changes"
        ? requestPolicyChanges.bind(null, policyId)
        : action === "approve"
          ? approvePolicy.bind(null, policyId)
          : publishPolicy.bind(null, policyId);

  const [state, formAction, pending] = useActionState(bound, initialState);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-border p-3"
    >
      <div className="space-y-2">
        <Label htmlFor={`notes-${action}`}>
          {notesLabel ?? "Notes"}
          {notesRequired ? "" : " (optional)"}
        </Label>
        <textarea
          id={`notes-${action}`}
          name="notes"
          required={notesRequired}
          className={textareaClassName}
          placeholder={
            action === "publish"
              ? "Change summary for this publication"
              : action === "request_changes"
                ? "What needs to change?"
                : "Optional notes for the approval trail"
          }
        />
        {state.fieldErrors?.notes ? (
          <p className="text-sm text-destructive">{state.fieldErrors.notes}</p>
        ) : null}
        {state.fieldErrors?.content ? (
          <p className="text-sm text-destructive">
            {state.fieldErrors.content}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          {labelForWorkflowAction(action)} completed.
        </p>
      ) : null}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Working…" : labelForWorkflowAction(action)}
      </Button>
    </form>
  );
}

function ConfirmActionButton({
  label,
  confirmMessage,
  variant,
  onConfirm,
}: {
  label: string;
  confirmMessage: string;
  variant?: "default" | "outline" | "destructive";
  onConfirm: () => Promise<PolicyActionState>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant={variant ?? "outline"}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmMessage)) return;
          setError(null);
          startTransition(async () => {
            const result = await onConfirm();
            if (result.error) setError(result.error);
          });
        }}
      >
        {pending ? "Working…" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function PolicyWorkflowActions({
  policyId,
  status,
}: {
  policyId: string;
  status: PolicyDocumentStatus;
}) {
  const actions = allowedWorkflowActions(status);

  if (actions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Workflow</h2>
        <p className="text-sm text-muted-foreground">
          Move this policy through review, approval, and publication.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {actions.includes("submit") ? (
          <WorkflowForm policyId={policyId} action="submit" />
        ) : null}
        {actions.includes("request_changes") ? (
          <WorkflowForm
            policyId={policyId}
            action="request_changes"
            notesRequired
            notesLabel="Requested changes"
          />
        ) : null}
        {actions.includes("approve") ? (
          <WorkflowForm policyId={policyId} action="approve" />
        ) : null}
        {actions.includes("publish") ? (
          <WorkflowForm
            policyId={policyId}
            action="publish"
            notesLabel="Publication notes / change summary"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.includes("start_revision") ? (
          <ConfirmActionButton
            label={labelForWorkflowAction("start_revision")}
            confirmMessage="Start a new draft revision from the published version? The library copy will leave published status until you publish again."
            onConfirm={() => startPolicyRevision(policyId)}
          />
        ) : null}
        {actions.includes("retire") ? (
          <ConfirmActionButton
            label={labelForWorkflowAction("retire")}
            confirmMessage="Retire this policy? It will leave the published library."
            variant="destructive"
            onConfirm={() => retirePolicy(policyId)}
          />
        ) : null}
        {actions.includes("archive") ? (
          <ConfirmActionButton
            label={labelForWorkflowAction("archive")}
            confirmMessage="Archive this policy? It can be restored later."
            variant="destructive"
            onConfirm={() => archivePolicy(policyId)}
          />
        ) : null}
        {actions.includes("restore") ? (
          <ConfirmActionButton
            label={labelForWorkflowAction("restore")}
            confirmMessage="Restore this policy to draft?"
            onConfirm={() => restorePolicy(policyId)}
          />
        ) : null}
      </div>
    </div>
  );
}
