import {
  isDashboardBoxKey,
  listDashboardBoxDefinitions,
} from "@/lib/dashboard/dashboard-box-registry";
import {
  getAccessibleTextColor,
  normalizeHexColor,
} from "@/lib/dashboard/colors";
import type {
  DashboardBoxKey,
  DashboardBoxSettingInput,
} from "@/lib/dashboard/types";

export type DashboardSettingsValidationResult =
  | { ok: true; settings: DashboardBoxSettingInput[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function parseDashboardBoxKey(
  value: FormDataEntryValue | null,
): DashboardBoxKey | null {
  const raw = String(value ?? "").trim();
  return isDashboardBoxKey(raw) ? raw : null;
}

export function parseHexColorField(
  value: FormDataEntryValue | null,
): { color?: string; error?: string } {
  const normalized = normalizeHexColor(String(value ?? ""));
  if (!normalized) {
    return { error: "Enter a valid color as #RRGGBB." };
  }
  return { color: normalized };
}

/**
 * Validate a full church dashboard settings payload.
 * Normalizes order to 10, 20, 30… and hex colors.
 */
export function validateDashboardSettingsUpdate(
  rows: Array<{
    boxKey: string;
    isVisible: boolean;
    displayOrder: number;
    backgroundColor: string;
    textColor: string;
    useAutomaticTextColor: boolean;
  }>,
): DashboardSettingsValidationResult {
  const registryKeys = listDashboardBoxDefinitions().map((item) => item.key);
  if (rows.length === 0) {
    return { ok: false, error: "No dashboard box settings were submitted." };
  }

  const seen = new Set<string>();
  const fieldErrors: Record<string, string> = {};
  const prepared: DashboardBoxSettingInput[] = [];

  for (const row of rows) {
    if (!isDashboardBoxKey(row.boxKey)) {
      fieldErrors[row.boxKey] = "Unknown dashboard box.";
      continue;
    }
    if (seen.has(row.boxKey)) {
      return {
        ok: false,
        error: "Duplicate dashboard box settings are not allowed.",
      };
    }
    seen.add(row.boxKey);

    const backgroundColor = normalizeHexColor(row.backgroundColor);
    if (!backgroundColor) {
      fieldErrors[`${row.boxKey}.backgroundColor`] =
        "Background color must be #RRGGBB.";
      continue;
    }

    let textColor = normalizeHexColor(row.textColor);
    if (row.useAutomaticTextColor) {
      textColor = getAccessibleTextColor(backgroundColor);
    } else if (!textColor) {
      fieldErrors[`${row.boxKey}.textColor`] = "Text color must be #RRGGBB.";
      continue;
    }

    if (
      !Number.isFinite(row.displayOrder) ||
      row.displayOrder < 0 ||
      row.displayOrder > 1000
    ) {
      fieldErrors[`${row.boxKey}.displayOrder`] = "Invalid display order.";
      continue;
    }

    prepared.push({
      boxKey: row.boxKey,
      isVisible: Boolean(row.isVisible),
      displayOrder: Math.trunc(row.displayOrder),
      backgroundColor,
      textColor: textColor!,
      useAutomaticTextColor: Boolean(row.useAutomaticTextColor),
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Fix the highlighted dashboard settings.",
      fieldErrors,
    };
  }

  // Require every known registry key so partial saves cannot drop boxes silently.
  for (const key of registryKeys) {
    if (!seen.has(key)) {
      return {
        ok: false,
        error: `Missing settings for dashboard box “${key}”.`,
      };
    }
  }

  for (const key of seen) {
    if (!registryKeys.includes(key as DashboardBoxKey)) {
      return { ok: false, error: `Unknown dashboard box “${key}”.` };
    }
  }

  const visibleCount = prepared.filter((row) => row.isVisible).length;
  if (visibleCount === 0) {
    return {
      ok: false,
      error: "Keep at least one dashboard box visible.",
    };
  }

  const normalized = normalizeDashboardDisplayOrder(prepared);
  return { ok: true, settings: normalized };
}

/** Stable 10-step ordering after user reorder. */
export function normalizeDashboardDisplayOrder(
  settings: DashboardBoxSettingInput[],
): DashboardBoxSettingInput[] {
  return [...settings]
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.boxKey.localeCompare(b.boxKey);
    })
    .map((row, index) => ({
      ...row,
      displayOrder: (index + 1) * 10,
    }));
}

export function settingsMatchSystemDefault(input: {
  boxKey: DashboardBoxKey;
  isVisible: boolean;
  displayOrder: number;
  backgroundColor: string;
  textColor: string;
  useAutomaticTextColor: boolean;
  definition: {
    defaultVisible: boolean;
    defaultOrder: number;
    defaultBackgroundColor: string;
    defaultTextColor: string;
  };
}): boolean {
  const bg = normalizeHexColor(input.backgroundColor);
  const text = normalizeHexColor(input.textColor);
  const defBg = normalizeHexColor(input.definition.defaultBackgroundColor);
  const defText = normalizeHexColor(input.definition.defaultTextColor);
  return (
    input.isVisible === input.definition.defaultVisible &&
    input.displayOrder === input.definition.defaultOrder &&
    bg === defBg &&
    text === defText &&
    input.useAutomaticTextColor === true
  );
}
