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

function surfaceFromHex(
  hex: string,
  lightness: number,
  satMin: number,
  satMax: number,
): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  return formatHsl({
    h: hsl.h,
    s: Math.min(Math.max(hsl.s, satMin), satMax),
    l: lightness,
  });
}

function softSurfaceFromHex(hex: string): string | null {
  return surfaceFromHex(hex, 94, 0, 40);
}

function hoverSurfaceFromHex(hex: string): string | null {
  return surfaceFromHex(hex, 86, 40, 70);
}

function darkSoftSurfaceFromHex(hex: string): string | null {
  return surfaceFromHex(hex, 22, 12, 36);
}

function darkHoverSurfaceFromHex(hex: string): string | null {
  return surfaceFromHex(hex, 28, 18, 42);
}

function darkPrimaryFromHex(hex: string): { value: string; lightness: number } | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const lightness = hsl.l < 30 ? 42 : hsl.l > 72 ? 58 : hsl.l;
  return { value: formatHsl({ h: hsl.h, s: hsl.s, l: lightness }), lightness };
}

function foregroundForLightness(lightness: number): string {
  return lightness > 45 ? "0 0% 9%" : "0 0% 98%";
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

export function hasChurchBrandTokens(style: CSSProperties): boolean {
  return Object.keys(style).length > 0;
}

/**
 * CSS variables for the authenticated app shell.
 * Applied through [data-church-branded] so Light and Dark each get
 * appropriate accent/hover/primary surfaces. Setting --accent inline
 * would freeze light-mode tints into dark mode.
 */
export function churchBrandStyle(
  primaryHex: string | null | undefined,
  secondaryHex: string | null | undefined,
): CSSProperties {
  const style: Record<string, string> = {};

  if (isBrandHexColor(primaryHex)) {
    const primary = hexToHslComponents(primaryHex);
    const darkPrimary = darkPrimaryFromHex(primaryHex);
    if (primary && darkPrimary) {
      style["--brand-primary"] = primary;
      style["--brand-primary-foreground"] = contrastingForegroundHsl(primaryHex);
      style["--brand-primary-dark"] = darkPrimary.value;
      style["--brand-primary-dark-foreground"] = foregroundForLightness(
        darkPrimary.lightness,
      );
    }
  }

  const accentSource = isBrandHexColor(secondaryHex)
    ? secondaryHex
    : isBrandHexColor(primaryHex)
      ? primaryHex
      : null;

  if (accentSource) {
    const secondary = hexToHslComponents(accentSource);
    const soft = softSurfaceFromHex(accentSource);
    const hover = hoverSurfaceFromHex(accentSource);
    const darkSoft = darkSoftSurfaceFromHex(accentSource);
    const darkHover = darkHoverSurfaceFromHex(accentSource);
    if (secondary && soft && hover && darkSoft && darkHover) {
      style["--brand-secondary"] = secondary;
      style["--brand-accent"] = soft;
      style["--brand-accent-foreground"] = "0 0% 9%";
      style["--brand-nav-hover"] = hover;
      style["--brand-accent-dark"] = darkSoft;
      style["--brand-accent-dark-foreground"] = "0 0% 96%";
      style["--brand-nav-hover-dark"] = darkHover;
    }
  }

  return style as CSSProperties;
}
