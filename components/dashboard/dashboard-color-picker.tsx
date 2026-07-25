"use client";

import { useEffect, useState } from "react";
import { DASHBOARD_COLOR_PRESETS, normalizeHexColor } from "@/lib/dashboard/colors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FALLBACK_HEX = "#E5E7EB";

export function DashboardColorPicker({
  id,
  label,
  value,
  disabled,
  onChange,
  allowEmpty = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
  /** When true, empty values are allowed (clearable optional colors). */
  allowEmpty?: boolean;
  error?: string;
}) {
  const normalized = normalizeHexColor(value);
  const previewHex = normalized ?? FALLBACK_HEX;
  const [hexDraft, setHexDraft] = useState(normalized ?? (allowEmpty ? "" : FALLBACK_HEX));

  useEffect(() => {
    setHexDraft(normalized ?? (allowEmpty ? "" : FALLBACK_HEX));
  }, [normalized, allowEmpty]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          type="color"
          value={previewHex.toLowerCase()}
          disabled={disabled}
          onChange={(event) => {
            const next = normalizeHexColor(event.target.value);
            if (next) onChange(next);
          }}
          className="h-11 w-14 cursor-pointer rounded border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`${label} color picker`}
        />
        <Input
          id={`${id}-hex`}
          value={hexDraft}
          disabled={disabled}
          maxLength={7}
          placeholder="#1A6B4A"
          className="h-11 w-28 font-mono uppercase"
          aria-label={`${label} hex value`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            const raw = event.target.value.trim().toUpperCase();
            setHexDraft(raw);

            if (raw === "") {
              if (allowEmpty) onChange("");
              return;
            }

            const withHash = raw.startsWith("#") ? raw : `#${raw}`;
            const next = normalizeHexColor(withHash);
            if (next) onChange(next);
          }}
          onBlur={() => {
            if (allowEmpty && hexDraft.trim() === "") {
              setHexDraft("");
              onChange("");
              return;
            }
            const withHash = hexDraft.startsWith("#")
              ? hexDraft
              : `#${hexDraft}`;
            const next = normalizeHexColor(withHash);
            if (next) {
              setHexDraft(next);
              onChange(next);
            } else {
              setHexDraft(normalized ?? (allowEmpty ? "" : FALLBACK_HEX));
            }
          }}
        />
        <span
          className="inline-flex h-11 min-w-16 items-center justify-center rounded-md border px-3 text-xs font-medium"
          style={{
            backgroundColor: previewHex,
            color: "#111827",
            opacity: normalized || !allowEmpty ? 1 : 0.45,
          }}
          aria-hidden
        >
          Preview
        </span>
        {allowEmpty && normalized ? (
          <button
            type="button"
            disabled={disabled}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            onClick={() => {
              setHexDraft("");
              onChange("");
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {DASHBOARD_COLOR_PRESETS.map((preset) => {
          const selected = normalized === preset.hex.toUpperCase();
          return (
            <button
              key={preset.key}
              type="button"
              disabled={disabled}
              title={preset.label}
              aria-label={`Use ${preset.label} (${preset.hex})`}
              aria-pressed={selected}
              onClick={() => onChange(preset.hex.toUpperCase())}
              className={cn(
                "h-8 w-8 rounded-full border-2 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "border-foreground ring-2 ring-ring" : "border-white/80",
              )}
              style={{ backgroundColor: preset.hex }}
            />
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
