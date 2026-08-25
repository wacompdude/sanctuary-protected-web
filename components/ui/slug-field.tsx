"use client";

import { FieldLabelWithHelp } from "@/components/ui/field-help";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SLUG_FIELD_LABEL,
  SLUG_HELP_LABEL,
} from "@/lib/organization/slug";

export function SlugField({
  id = "slug",
  name = "slug",
  label = SLUG_FIELD_LABEL,
  help,
  helpLabel = SLUG_HELP_LABEL,
  value,
  onChange,
  error,
  generateLabel = "Generate from name",
  onGenerate,
  showGenerate = false,
  className,
}: {
  id?: string;
  name?: string;
  label?: string;
  help: string;
  helpLabel?: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  generateLabel?: string;
  onGenerate?: () => void;
  showGenerate?: boolean;
  className?: string;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className={cn("space-y-2", className)}>
      <FieldLabelWithHelp
        htmlFor={id}
        label={label}
        helpLabel={helpLabel}
        help={help}
      />
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="first-church"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : hintId}
        className="font-mono text-sm"
      />
      <p id={hintId} className="break-all text-xs text-muted-foreground">
        {value.trim()
          ? `Identifier: ${value.trim().toLowerCase()}`
          : "Created automatically from the name. You can edit it."}
      </p>
      {showGenerate && onGenerate ? (
        <button
          type="button"
          className="min-h-11 text-sm text-primary underline-offset-4 hover:underline md:min-h-0"
          onClick={onGenerate}
        >
          {generateLabel}
        </button>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
