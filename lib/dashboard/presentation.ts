import {
  deriveDashboardBoxPalette,
  DASHBOARD_TEXT_DARK,
  mixHexColor,
  resolveDashboardTextColor,
} from "@/lib/dashboard/colors";
import { normalizeDashboardItemCount } from "@/lib/dashboard/sort";
import type { DashboardBoxPalette } from "@/lib/dashboard/types";

/** Page-surface blends so zero-count boxes recede without using card opacity. */
export const DASHBOARD_ZERO_COUNT_LIGHT_BLEND = "#FFFFFF";
export const DASHBOARD_ZERO_COUNT_DARK_BLEND = "#111827";
export const DASHBOARD_ZERO_COUNT_BLEND_AMOUNT = 0.5;

export function isDashboardBoxZeroCount(itemCount: unknown): boolean {
  return normalizeDashboardItemCount(itemCount) === 0;
}

/**
 * Display-only palette for a zero-count box.
 * Does not persist. Recomputes text for contrast on the blended background.
 */
export function deriveZeroCountDashboardBoxPalette(
  configuredBackground: string,
  configuredTextColor: string | undefined,
  theme: "light" | "dark",
): DashboardBoxPalette {
  const blendTarget =
    theme === "dark"
      ? DASHBOARD_ZERO_COUNT_DARK_BLEND
      : DASHBOARD_ZERO_COUNT_LIGHT_BLEND;
  const backgroundColor = mixHexColor(
    configuredBackground,
    blendTarget,
    DASHBOARD_ZERO_COUNT_BLEND_AMOUNT,
  );
  const textResolution = resolveDashboardTextColor({
    backgroundColor,
    textColor: configuredTextColor ?? DASHBOARD_TEXT_DARK,
    useAutomaticTextColor: true,
  });
  return deriveDashboardBoxPalette(backgroundColor, textResolution.textColor);
}

export function getDashboardBoxDisplayPalette(params: {
  configuredBackground: string;
  configuredText: string;
  itemCount: unknown;
  theme: "light" | "dark";
}): DashboardBoxPalette {
  if (!isDashboardBoxZeroCount(params.itemCount)) {
    return deriveDashboardBoxPalette(
      params.configuredBackground,
      params.configuredText,
    );
  }
  return deriveZeroCountDashboardBoxPalette(
    params.configuredBackground,
    params.configuredText,
    params.theme,
  );
}
