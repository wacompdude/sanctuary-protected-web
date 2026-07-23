"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import {
  resetAllDashboardBoxSettingsAction,
  resetDashboardBoxSettingAction,
  saveDashboardBoxSettingsAction,
  type DashboardSettingsActionState,
} from "@/app/(app)/settings/dashboard/actions";
import { DashboardBoxPreviewTile } from "@/components/dashboard/dashboard-box-preview-tile";
import { DashboardColorPicker } from "@/components/dashboard/dashboard-color-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  deriveDashboardBoxPalette,
  resolveDashboardTextColor,
} from "@/lib/dashboard/colors";
import { getDashboardBoxDefinition } from "@/lib/dashboard/dashboard-box-registry";
import { normalizeDashboardDisplayOrder } from "@/lib/dashboard/validation";
import type {
  DashboardBoxKey,
  ResolvedDashboardBoxSetting,
} from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type EditorBox = {
  key: DashboardBoxKey;
  title: string;
  description: string;
  category: ResolvedDashboardBoxSetting["category"];
  isVisible: boolean;
  displayOrder: number;
  backgroundColor: string;
  textColor: string;
  useAutomaticTextColor: boolean;
  isPlaceholder: boolean;
};

const initialState: DashboardSettingsActionState = {};

const CATEGORY_LABELS: Record<EditorBox["category"], string> = {
  operations: "Operations",
  integrations: "Integrations",
  compliance: "Compliance",
  schedule: "Schedule",
};

function toEditorBoxes(settings: ResolvedDashboardBoxSetting[]): EditorBox[] {
  return settings.map((box) => ({
    key: box.key,
    title: box.title,
    description: box.description,
    category: box.category,
    isVisible: box.isVisible,
    displayOrder: box.displayOrder,
    backgroundColor: box.backgroundColor,
    textColor: box.textColor,
    useAutomaticTextColor: box.useAutomaticTextColor,
    isPlaceholder: box.isPlaceholder,
  }));
}

function withResolvedColors(box: EditorBox): EditorBox & {
  contrastRatio: number;
  contrastAcceptable: boolean;
  palette: ReturnType<typeof deriveDashboardBoxPalette>;
} {
  const text = resolveDashboardTextColor({
    backgroundColor: box.backgroundColor,
    textColor: box.textColor,
    useAutomaticTextColor: box.useAutomaticTextColor,
  });
  return {
    ...box,
    textColor: text.textColor,
    contrastRatio: text.contrastRatio,
    contrastAcceptable: text.contrastAcceptable,
    palette: deriveDashboardBoxPalette(box.backgroundColor, text.textColor),
  };
}

export function DashboardSettingsForm({
  initialSettings,
  canEdit,
  migrationAvailable,
}: {
  initialSettings: ResolvedDashboardBoxSetting[];
  canEdit: boolean;
  migrationAvailable: boolean;
}) {
  const router = useRouter();
  const [boxes, setBoxes] = useState(() => toEditorBoxes(initialSettings));
  const [expandedKey, setExpandedKey] = useState<DashboardBoxKey | null>(null);
  const [saveState, saveAction, savePending] = useActionState(
    saveDashboardBoxSettingsAction,
    initialState,
  );
  const [resetPending, startResetTransition] = useTransition();
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    setBoxes(toEditorBoxes(initialSettings));
  }, [initialSettings]);

  useEffect(() => {
    if (saveState.success) {
      setResetMessage(null);
      setResetError(null);
      router.refresh();
    }
  }, [saveState.success, router]);

  const ordered = useMemo(
    () =>
      [...boxes]
        .sort((a, b) => {
          if (a.displayOrder !== b.displayOrder) {
            return a.displayOrder - b.displayOrder;
          }
          return a.key.localeCompare(b.key);
        })
        .map(withResolvedColors),
    [boxes],
  );

  const previewBoxes = ordered.filter((box) => box.isVisible);

  const settingsJson = useMemo(
    () =>
      JSON.stringify(
        normalizeDashboardDisplayOrder(
          ordered.map((box) => ({
            boxKey: box.key,
            isVisible: box.isVisible,
            displayOrder: box.displayOrder,
            backgroundColor: box.backgroundColor,
            textColor: box.textColor,
            useAutomaticTextColor: box.useAutomaticTextColor,
          })),
        ),
      ),
    [ordered],
  );

  const controlsDisabled = !canEdit || savePending || resetPending;
  const saveDisabled = controlsDisabled || !migrationAvailable;

  function updateBox(
    key: DashboardBoxKey,
    patch: Partial<Omit<EditorBox, "key" | "title" | "description" | "category" | "isPlaceholder">>,
  ) {
    setBoxes((current) =>
      current.map((box) => {
        if (box.key !== key) return box;
        const next = { ...box, ...patch };
        if (
          patch.backgroundColor !== undefined &&
          next.useAutomaticTextColor
        ) {
          const resolved = resolveDashboardTextColor({
            backgroundColor: next.backgroundColor,
            textColor: next.textColor,
            useAutomaticTextColor: true,
          });
          next.textColor = resolved.textColor;
        }
        return next;
      }),
    );
  }

  function moveBox(key: DashboardBoxKey, direction: -1 | 1) {
    setBoxes((current) => {
      const sorted = [...current].sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return a.key.localeCompare(b.key);
      });
      const index = sorted.findIndex((box) => box.key === key);
      const swapWith = index + direction;
      if (index < 0 || swapWith < 0 || swapWith >= sorted.length) {
        return current;
      }

      const reordered = [...sorted];
      const temp = reordered[index]!;
      reordered[index] = reordered[swapWith]!;
      reordered[swapWith] = temp;

      // Assign order from the new array positions. Do not re-sort by the
      // previous displayOrder values — that would undo the swap.
      return reordered.map((box, orderIndex) => ({
        ...box,
        displayOrder: (orderIndex + 1) * 10,
      }));
    });
  }

  function resetBoxLocal(key: DashboardBoxKey) {
    const definition = getDashboardBoxDefinition(key);
    if (!definition) return;
    updateBox(key, {
      isVisible: definition.defaultVisible,
      displayOrder: definition.defaultOrder,
      backgroundColor: definition.defaultBackgroundColor,
      textColor: definition.defaultTextColor,
      useAutomaticTextColor: true,
    });
  }

  function resetBoxOnServer(key: DashboardBoxKey) {
    setResetMessage(null);
    setResetError(null);
    startResetTransition(async () => {
      const formData = new FormData();
      formData.set("box_key", key);
      const result = await resetDashboardBoxSettingAction({}, formData);
      if (result.error) {
        setResetError(result.error);
        return;
      }
      resetBoxLocal(key);
      setResetMessage(`Reset “${getDashboardBoxDefinition(key)?.title ?? key}” to defaults.`);
      router.refresh();
    });
  }

  function resetAllOnServer() {
    if (
      !window.confirm(
        "Reset all dashboard boxes to system defaults? This removes church-specific overrides.",
      )
    ) {
      return;
    }
    setResetMessage(null);
    setResetError(null);
    startResetTransition(async () => {
      const result = await resetAllDashboardBoxSettingsAction({});
      if (result.error) {
        setResetError(result.error);
        return;
      }
      setBoxes((current) =>
        current.map((box) => {
          const definition = getDashboardBoxDefinition(box.key)!;
          return {
            ...box,
            isVisible: definition.defaultVisible,
            displayOrder: definition.defaultOrder,
            backgroundColor: definition.defaultBackgroundColor,
            textColor: definition.defaultTextColor,
            useAutomaticTextColor: true,
          };
        }),
      );
      setResetMessage("All dashboard boxes reset to system defaults.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {!migrationAvailable ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Dashboard customization requires migration{" "}
          <code className="font-mono text-xs">040_dashboard_box_settings.sql</code>
          . Defaults are shown for preview only until the migration is applied.
        </p>
      ) : null}

      {saveState.error || resetError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {saveState.error ?? resetError}
        </p>
      ) : null}
      {saveState.success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Dashboard settings saved.
        </p>
      ) : null}
      {resetMessage ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {resetMessage}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
          <CardDescription>
            Visible boxes in the order they will appear on the dashboard. Hidden
            boxes are listed below the grid for editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewBoxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              At least one box must stay visible.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {previewBoxes.map((box) => (
                <DashboardBoxPreviewTile
                  key={box.key}
                  title={box.title}
                  description={box.description}
                  backgroundColor={box.palette.backgroundColor}
                  textColor={box.palette.textColor}
                  mutedTextColor={box.palette.mutedTextColor}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="settings_json" value={settingsJson} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Boxes</h2>
            <p className="text-sm text-muted-foreground">
              Toggle visibility, reorder, and choose colors. Campus filters still
              affect counts on the dashboard, not this layout.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={saveDisabled}
              onClick={resetAllOnServer}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset all
            </Button>
            <Button type="submit" className="h-11" disabled={saveDisabled}>
              {savePending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {ordered.map((box, index) => {
            const expanded = expandedKey === box.key;
            return (
              <Card
                key={box.key}
                className={cn(!box.isVisible && "opacity-90")}
              >
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="w-full max-w-[11rem] shrink-0">
                      <DashboardBoxPreviewTile
                        title={box.title}
                        description={box.description}
                        backgroundColor={box.palette.backgroundColor}
                        textColor={box.palette.textColor}
                        mutedTextColor={box.palette.mutedTextColor}
                        hidden={!box.isVisible}
                        sampleValue={box.isPlaceholder ? "—" : "12"}
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium leading-tight">{box.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {CATEGORY_LABELS[box.category]}
                            {box.isPlaceholder ? " · Placeholder" : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            disabled={controlsDisabled || index === 0}
                            aria-label={`Move ${box.title} up`}
                            onClick={() => moveBox(box.key, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            disabled={
                              controlsDisabled || index === ordered.length - 1
                            }
                            aria-label={`Move ${box.title} down`}
                            onClick={() => moveBox(box.key, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-10"
                            disabled={controlsDisabled}
                            onClick={() =>
                              setExpandedKey(expanded ? null : box.key)
                            }
                          >
                            {expanded ? "Hide colors" : "Edit colors"}
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`visible-${box.key}`}
                            checked={box.isVisible}
                            disabled={controlsDisabled}
                            onCheckedChange={(checked) =>
                              updateBox(box.key, {
                                isVisible: checked === true,
                              })
                            }
                          />
                          <Label htmlFor={`visible-${box.key}`}>Visible</Label>
                        </div>
                        {!box.contrastAcceptable ? (
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            Contrast {box.contrastRatio}:1 is below WCAG AA
                            (4.5:1). Consider automatic text color or a different
                            background.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Contrast {box.contrastRatio}:1
                          </p>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9"
                          disabled={saveDisabled}
                          onClick={() => resetBoxOnServer(box.key)}
                        >
                          Reset box
                        </Button>
                      </div>

                      {expanded ? (
                        <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                          <DashboardColorPicker
                            id={`bg-${box.key}`}
                            label="Background color"
                            value={box.backgroundColor}
                            disabled={controlsDisabled}
                            onChange={(hex) =>
                              updateBox(box.key, { backgroundColor: hex })
                            }
                          />

                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`auto-text-${box.key}`}
                              checked={box.useAutomaticTextColor}
                              disabled={controlsDisabled}
                              onCheckedChange={(checked) => {
                                const useAutomaticTextColor = checked === true;
                                if (useAutomaticTextColor) {
                                  const resolved = resolveDashboardTextColor({
                                    backgroundColor: box.backgroundColor,
                                    textColor: box.textColor,
                                    useAutomaticTextColor: true,
                                  });
                                  updateBox(box.key, {
                                    useAutomaticTextColor: true,
                                    textColor: resolved.textColor,
                                  });
                                } else {
                                  updateBox(box.key, {
                                    useAutomaticTextColor: false,
                                  });
                                }
                              }}
                            />
                            <Label htmlFor={`auto-text-${box.key}`}>
                              Automatic text color
                            </Label>
                          </div>

                          {!box.useAutomaticTextColor ? (
                            <DashboardColorPicker
                              id={`text-${box.key}`}
                              label="Text color"
                              value={box.textColor}
                              disabled={controlsDisabled}
                              onChange={(hex) =>
                                updateBox(box.key, { textColor: hex })
                              }
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Text color is set to{" "}
                              <span className="font-mono">{box.textColor}</span>{" "}
                              for readable contrast.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" className="h-11" disabled={saveDisabled}>
            {savePending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
