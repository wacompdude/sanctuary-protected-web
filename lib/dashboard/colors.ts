import type { DashboardBoxPalette } from "@/lib/dashboard/types";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export const DASHBOARD_TEXT_DARK = "#111827";
export const DASHBOARD_TEXT_LIGHT = "#FFFFFF";

export const DASHBOARD_COLOR_PRESETS = [
  { key: "silver", label: "Silver", hex: "#C0C0C0" },
  { key: "yellow", label: "Yellow", hex: "#FACC15" },
  { key: "red", label: "Red", hex: "#DC2626" },
  { key: "orange", label: "Orange", hex: "#F97316" },
  { key: "green", label: "Green", hex: "#16A34A" },
  { key: "blue", label: "Blue", hex: "#2563EB" },
  { key: "purple", label: "Purple", hex: "#7C3AED" },
  { key: "gray", label: "Gray", hex: "#6B7280" },
  { key: "dark", label: "Dark", hex: "#1F2937" },
] as const;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

/** Normalize to #RRGGBB uppercase. Accepts #RGB or #RRGGBB. */
export function normalizeHexColor(value: string): string | null {
  const raw = value.trim();
  const short = /^#([0-9A-Fa-f]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (!isHexColor(raw)) return null;
  return raw.toUpperCase();
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG 2.1 (0–1). */
export function getRelativeLuminance(hex: string): number {
  const rgb = parseRgb(hex);
  if (!rgb) return 0;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** Contrast ratio between two colors (1–21). */
export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = getRelativeLuminance(foregroundHex);
  const l2 = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isContrastAcceptable(
  foregroundHex: string,
  backgroundHex: string,
  minimumRatio = 4.5,
): boolean {
  return getContrastRatio(foregroundHex, backgroundHex) >= minimumRatio;
}

/** Prefer dark or light text for readable contrast on the background. */
export function getAccessibleTextColor(backgroundHex: string): string {
  const darkRatio = getContrastRatio(DASHBOARD_TEXT_DARK, backgroundHex);
  const lightRatio = getContrastRatio(DASHBOARD_TEXT_LIGHT, backgroundHex);
  return darkRatio >= lightRatio ? DASHBOARD_TEXT_DARK : DASHBOARD_TEXT_LIGHT;
}

function mixToward(
  hex: string,
  target: string,
  amount: number,
): string {
  const a = parseRgb(hex);
  const b = parseRgb(target);
  if (!a || !b) return normalizeHexColor(hex) ?? "#111827";
  const mix = (from: number, to: number) =>
    Math.round(from + (to - from) * amount);
  const r = mix(a.r, b.r).toString(16).padStart(2, "0");
  const g = mix(a.g, b.g).toString(16).padStart(2, "0");
  const bl = mix(a.b, b.b).toString(16).padStart(2, "0");
  return `#${r}${g}${bl}`.toUpperCase();
}

/**
 * Derived presentation colors for a customized dashboard box.
 * Only validated hex values should be passed in.
 */
export function deriveDashboardBoxPalette(
  backgroundColor: string,
  textColor?: string,
): DashboardBoxPalette {
  const bg = normalizeHexColor(backgroundColor) ?? "#E5E7EB";
  const fg =
    normalizeHexColor(textColor ?? "") ?? getAccessibleTextColor(bg);
  const mutedToward = fg === DASHBOARD_TEXT_LIGHT ? "#FFFFFF" : "#111827";
  const mutedTextColor = mixToward(fg, mutedToward === fg ? bg : mutedToward, 0.35);
  // Prefer a slightly darker border than the fill for definition.
  const borderColor = mixToward(bg, "#111827", 0.22);

  return {
    backgroundColor: bg,
    textColor: fg,
    mutedTextColor: normalizeHexColor(mutedTextColor) ?? fg,
    borderColor,
    linkColor: fg,
  };
}

/** Resolve final text color from auto/manual preference. */
export function resolveDashboardTextColor(params: {
  backgroundColor: string;
  textColor: string;
  useAutomaticTextColor: boolean;
}): {
  textColor: string;
  contrastRatio: number;
  contrastAcceptable: boolean;
} {
  const backgroundColor =
    normalizeHexColor(params.backgroundColor) ?? "#E5E7EB";
  const textColor = params.useAutomaticTextColor
    ? getAccessibleTextColor(backgroundColor)
    : (normalizeHexColor(params.textColor) ??
      getAccessibleTextColor(backgroundColor));
  const contrastRatio = getContrastRatio(textColor, backgroundColor);
  return {
    textColor,
    contrastRatio: Math.round(contrastRatio * 100) / 100,
    contrastAcceptable: contrastRatio >= 4.5,
  };
}
