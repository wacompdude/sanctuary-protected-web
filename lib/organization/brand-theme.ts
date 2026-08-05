import type { CSSProperties } from "react";

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

type Hsl = { h: number; s: number; l: number };

export function isBrandHexColor(value: string | null | undefined): value is string {
  return Boolean(value && HEX_PATTERN.test(value));
}

function hexToHsl(hex: string): Hsl | null {
  if (!isBrandHexColor(hex)) return null;

  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        hue = ((b - r) / delta + 2) / 6;
        break;
      default:
        hue = ((r - g) / delta + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(hue * 360),
    s: Math.round(saturation * 1000) / 10,
    l: Math.round(lightness * 1000) / 10,
  };
}

function formatHsl(hsl: Hsl): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

/** Convert #RRGGBB to shadcn/Tailwind HSL components: "H S% L%". */
export function hexToHslComponents(hex: string): string | null {
  const hsl = hexToHsl(hex);
  return hsl ? formatHsl(hsl) : null;
}

/** Soft fill for submenu shells from a brand hue. */
function softSurfaceFromHex(hex: string): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return formatHsl({
    h: hsl.h,
    s: Math.min(hsl.s, 40),
    l: 94,
  });
}

/** Stronger tint so nav hover clearly shows the secondary brand color. */
function hoverSurfaceFromHex(hex: string): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return formatHsl({
    h: hsl.h,
    s: Math.min(Math.max(hsl.s, 40), 70),
    l: 86,
  });
}

/** Relative luminance 0–1 for sRGB hex. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrastingForegroundHsl(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "0 0% 9%" : "0 0% 98%";
}

/**
 * CSS variables for the authenticated app shell.
 * Primary drives buttons / active nav / rings; secondary (or a soft primary tint)
 * drives accent/hover surfaces and submenu shells.
 */
export function churchBrandStyle(
  primaryHex: string | null | undefined,
  secondaryHex: string | null | undefined,
): CSSProperties {
  const style: Record<string, string> = {};

  if (isBrandHexColor(primaryHex)) {
    const primary = hexToHslComponents(primaryHex);
    if (primary) {
      style["--primary"] = primary;
      style["--primary-foreground"] = contrastingForegroundHsl(primaryHex);
      style["--ring"] = primary;
    }
  }

  if (isBrandHexColor(secondaryHex)) {
    const secondary = hexToHslComponents(secondaryHex);
    const soft = softSurfaceFromHex(secondaryHex);
    const hover = hoverSurfaceFromHex(secondaryHex);
    if (secondary && soft && hover) {
      // Soft secondary for shells; richer tint for nav hover.
      style["--accent"] = soft;
      style["--accent-foreground"] = "0 0% 9%";
      style["--nav-hover"] = hover;
      style["--brand-secondary"] = secondary;
      style["--secondary"] = soft;
      style["--secondary-foreground"] = "0 0% 9%";
    }
  } else if (isBrandHexColor(primaryHex)) {
    const soft = softSurfaceFromHex(primaryHex);
    const hover = hoverSurfaceFromHex(primaryHex);
    if (soft && hover) {
      style["--accent"] = soft;
      style["--accent-foreground"] = "0 0% 9%";
      style["--nav-hover"] = hover;
      style["--secondary"] = soft;
      style["--secondary-foreground"] = "0 0% 9%";
    }
  }

  return style as CSSProperties;
}
