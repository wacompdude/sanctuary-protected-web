"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
import {
  selectClassName,
  textareaClassName,
} from "@/components/incidents/incident-badges";
import type { ActionState } from "@/lib/church/types";

export function SettingsSectionCard({
  title,
  description,
  action,
  canEdit,
  submitLabel = "Save changes",
  children,
}: {
  title: string;
  description: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  canEdit: boolean;
  submitLabel?: string;
  children: (ctx: {
    fieldErrors?: Record<string, string>;
    canEdit: boolean;
  }) => ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Saved successfully.
            </p>
          )}

          <fieldset disabled={!canEdit || pending} className="min-w-0 space-y-4">
            {children({ fieldErrors: state.fieldErrors, canEdit })}
          </fieldset>

          {canEdit ? (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              View only. Owners and administrators can edit these settings.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function LabeledInput({
  id,
  name,
  label,
  defaultValue,
  error,
  type = "text",
  placeholder,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | number | null;
  error?: string;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function LabeledSelect({
  id,
  name,
  label,
  defaultValue,
  error,
  hint,
  options,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? options[0]?.value}
        className={selectClassName}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function LabeledTextarea({
  id,
  name,
  label,
  defaultValue,
  error,
  rows = 4,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  error?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        className={textareaClassName}
        aria-invalid={!!error}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function LabeledCheckbox({
  id,
  name,
  label,
  defaultChecked,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean | null;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input
          id={id}
          name={name}
          type="checkbox"
          value="true"
          defaultChecked={!!defaultChecked}
          className="mt-1 h-4 w-4 rounded border border-input"
        />
        <span>
          <span className="font-medium">{label}</span>
          {hint && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
