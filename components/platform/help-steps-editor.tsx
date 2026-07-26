"use client";

import { useActionState, useState } from "react";
import {
  deleteHelpStepAction,
  moveHelpStepAction,
  saveHelpStepAction,
} from "@/app/platform/help-actions";
import { PlatformButton } from "@/components/platform/platform-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HelpActionState, HelpArticleStep } from "@/lib/help/types";

const initialState: HelpActionState = {};

export function HelpStepsEditor({
  articleId,
  steps,
  canEdit,
}: {
  articleId: string;
  steps: HelpArticleStep[];
  canEdit: boolean;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [state, formAction, pending] = useActionState(
    saveHelpStepAction,
    initialState,
  );

  const editingStep =
    editingId && editingId !== "new"
      ? steps.find((step) => step.id === editingId)
      : null;

  const nextNumber =
    steps.reduce((max, step) => Math.max(max, step.step_number), 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Ordered steps</h2>
        {canEdit ? (
          <PlatformButton
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditingId("new")}
          >
            Add step
          </PlatformButton>
        ) : null}
      </div>

      {steps.length === 0 ? (
        <p className="text-sm text-slate-400">No draft steps yet.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-400">Step {step.step_number}</p>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-sm text-slate-400 line-clamp-2">
                    {step.instruction}
                  </p>
                  {step.deep_link_path ? (
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {step.deep_link_path}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={moveHelpStepAction}>
                      <input type="hidden" name="article_id" value={articleId} />
                      <input type="hidden" name="step_id" value={step.id} />
                      <input type="hidden" name="direction" value="up" />
                      <PlatformButton
                        type="submit"
                        size="sm"
                        variant="ghost"
                        disabled={index === 0}
                      >
                        Up
                      </PlatformButton>
                    </form>
                    <form action={moveHelpStepAction}>
                      <input type="hidden" name="article_id" value={articleId} />
                      <input type="hidden" name="step_id" value={step.id} />
                      <input type="hidden" name="direction" value="down" />
                      <PlatformButton
                        type="submit"
                        size="sm"
                        variant="ghost"
                        disabled={index === steps.length - 1}
                      >
                        Down
                      </PlatformButton>
                    </form>
                    <PlatformButton
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(step.id)}
                    >
                      Edit
                    </PlatformButton>
                    <form action={deleteHelpStepAction}>
                      <input type="hidden" name="article_id" value={articleId} />
                      <input type="hidden" name="step_id" value={step.id} />
                      <PlatformButton type="submit" size="sm" variant="ghost">
                        Delete
                      </PlatformButton>
                    </form>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {editingId && canEdit ? (
        <form
          action={formAction}
          className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4"
        >
          <input type="hidden" name="article_id" value={articleId} />
          {editingStep ? (
            <input type="hidden" name="step_id" value={editingStep.id} />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="help-step-number">Step number</Label>
              <Input
                id="help-step-number"
                name="step_number"
                type="number"
                min={1}
                defaultValue={editingStep?.step_number ?? nextNumber}
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="help-step-title">Title</Label>
              <Input
                id="help-step-title"
                name="title"
                defaultValue={editingStep?.title ?? ""}
                required
                className="border-slate-700 bg-slate-950"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="help-step-instruction">Instruction</Label>
            <textarea
              id="help-step-instruction"
              name="instruction"
              rows={4}
              defaultValue={editingStep?.instruction ?? ""}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="help-step-expected">Expected result</Label>
              <Input
                id="help-step-expected"
                name="expected_result"
                defaultValue={editingStep?.expected_result ?? ""}
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="help-step-deep-link">Deep link path</Label>
              <Input
                id="help-step-deep-link"
                name="deep_link_path"
                defaultValue={editingStep?.deep_link_path ?? ""}
                placeholder="/events/new"
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="help-step-deep-label">Deep link label</Label>
              <Input
                id="help-step-deep-label"
                name="deep_link_label"
                defaultValue={editingStep?.deep_link_label ?? ""}
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="help-step-feature">Required feature key</Label>
              <Input
                id="help-step-feature"
                name="required_feature_key"
                defaultValue={editingStep?.required_feature_key ?? ""}
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="help-step-tip">Tip</Label>
              <Input
                id="help-step-tip"
                name="tip_text"
                defaultValue={editingStep?.tip_text ?? ""}
                className="border-slate-700 bg-slate-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="help-step-warning">Warning</Label>
              <Input
                id="help-step-warning"
                name="warning_text"
                defaultValue={editingStep?.warning_text ?? ""}
                className="border-slate-700 bg-slate-950"
              />
            </div>
          </div>

          <input
            type="hidden"
            name="required_permission"
            value={editingStep?.required_permission ?? ""}
          />

          {state.error ? (
            <p className="text-sm text-rose-400">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-emerald-400">{state.success}</p>
          ) : null}

          <div className="flex gap-2">
            <PlatformButton type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save step"}
            </PlatformButton>
            <PlatformButton
              type="button"
              variant="ghost"
              onClick={() => setEditingId(null)}
            >
              Cancel
            </PlatformButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
