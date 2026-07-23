"use client";

import { DASHBOARD_COLOR_PRESETS, normalizeHexColor } from "@/lib/dashboard/colors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function DashboardColorPicker({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  const normalized = normalizeHexColor(value) ?? "#E5E7EB";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          type="color"
          value={normalized.toLowerCase()}
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
          value={normalized}
          disabled={disabled}
          maxLength={7}
          className="h-11 w-28 font-mono uppercase"
          aria-label={`${label} hex value`}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === "") return;
            const withHash = raw.startsWith("#") ? raw : `#${raw}`;
            const next = normalizeHexColor(withHash);
            if (next) onChange(next);
          }}
        />
        <span
          className="inline-flex h-11 min-w-16 items-center justify-center rounded-md border px-3 text-xs font-medium"
          style={{ backgroundColor: normalized, color: "#111827" }}
          aria-hidden
        >
          Preview
        </span>
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
    </div>
  );
}
