"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DashboardColorPicker } from "@/components/dashboard/dashboard-color-picker";
import { updateTrainingSettings } from "@/app/(app)/training/actions";
import {
  TRAINING_METRIC_CARD_DEFAULT_COLORS,
  TRAINING_METRIC_CARD_KEYS,
  TRAINING_METRIC_CARD_LABELS,
  type TrainingMetricCardKey,
  type TrainingMetricColorMap,
  resolveTrainingMetricBackground,
  resolveTrainingMetricPalette,
} from "@/lib/training/metric-colors";
import type { TrainingChurchSettings } from "@/lib/training/types";

const DUE_SOON_OPTIONS = [7, 14, 30, 60, 90];

export function TrainingSettingsForm({
  settings,
}: {
  settings: TrainingChurchSettings;
}) {
  const [state, action, pending] = useActionState(updateTrainingSettings, {});
  const [metricColors, setMetricColors] = useState<TrainingMetricColorMap>(
    () => ({ ...settings.dashboard_metric_colors }),
  );

  function updateMetricColor(key: TrainingMetricCardKey, hex: string) {
    setMetricColors((current) => ({ ...current, [key]: hex }));
  }

  function resetMetricColors() {
    setMetricColors({ ...TRAINING_METRIC_CARD_DEFAULT_COLORS });
  }

  return (
    <form action={action} className="space-y-8">
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? (
        <p className="text-sm text-green-600 dark:text-green-400">{state.success}</p>
      ) : null}

      <div className="max-w-lg space-y-4">
        <div className="space-y-2">
          <Label htmlFor="due_soon_days">Due soon window (days)</Label>
          <select
            id="due_soon_days"
            name="due_soon_days"
            defaultValue={settings.due_soon_days}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {DUE_SOON_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="reminder_at_assignment"
            value="true"
            defaultChecked={settings.reminder_at_assignment}
          />
          Remind at assignment
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="reminder_day_of"
            value="true"
            defaultChecked={settings.reminder_day_of}
          />
          Remind on training day
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notify_on_completion"
            value="true"
            defaultChecked={settings.notify_on_completion}
          />
          Notify on completion
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notify_on_cancel"
            value="true"
            defaultChecked={settings.notify_on_cancel}
          />
          Notify on cancellation
        </label>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Dashboard metric colors</h3>
            <p className="text-sm text-muted-foreground">
              Choose a background color for each Training dashboard metric card.
              Text color is selected automatically for contrast.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetMetricColors}
          >
            Reset colors
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRAINING_METRIC_CARD_KEYS.map((key) => {
            const background = resolveTrainingMetricBackground(key, metricColors);
            const palette = resolveTrainingMetricPalette(key, metricColors);
            return (
              <div key={key} className="space-y-3 rounded-lg border p-4">
                <input
                  type="hidden"
                  name={`metric_color_${key}`}
                  value={background}
                />
                <div
                  className="rounded-lg border p-3"
                  style={{
                    backgroundColor: palette.backgroundColor,
                    borderColor: palette.borderColor,
                    color: palette.textColor,
                  }}
                >
                  <p
                    className="text-xs font-medium"
                    style={{ color: palette.mutedTextColor }}
                  >
                    {TRAINING_METRIC_CARD_LABELS[key]}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">12</p>
                </div>
                <DashboardColorPicker
                  id={`metric-color-${key}`}
                  label="Background color"
                  value={background}
                  onChange={(hex) => updateMetricColor(key, hex)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        Save settings
      </Button>
    </form>
  );
}
