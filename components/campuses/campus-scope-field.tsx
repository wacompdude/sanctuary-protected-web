"use client";

import { Label } from "@/components/ui/label";
import { selectClassName } from "@/components/incidents/incident-badges";

export type CampusScopeOption = {
  id: string;
  name: string;
};

/**
 * Optional campus scope for create/edit forms.
 * Empty value = church-wide (all campuses).
 */
export function CampusScopeField({
  campuses,
  defaultValue = "",
  name = "campus_id",
  id = "campus_id",
  label = "Campus",
  hint = "Leave as Church-wide for records that apply to every campus.",
  disabled = false,
  required = false,
  error,
}: {
  campuses: CampusScopeOption[];
  defaultValue?: string | null;
  name?: string;
  id?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? "" : " (optional)"}
      </Label>
      <select
        id={id}
        name={name}
        className={selectClassName}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        required={required}
        aria-invalid={!!error}
      >
        <option value="">Church-wide (all campuses)</option>
        {campuses.map((campus) => (
          <option key={campus.id} value={campus.id}>
            {campus.name}
          </option>
        ))}
      </select>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
