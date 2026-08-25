/**
 * Church brand tokens must provide both light and dark surfaces.
 * Run: npx --yes tsx lib/organization/brand-theme.selfcheck.ts
 */
import {
  churchBrandStyle,
  contrastingForegroundHsl,
  hasChurchBrandTokens,
  hexToHslComponents,
} from "./brand-theme";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(hexToHslComponents("#1f3d34") !== null, "hex converts");
assert(contrastingForegroundHsl("#ffffff") === "0 0% 9%", "light hex uses dark text");
assert(contrastingForegroundHsl("#14201c") === "0 0% 98%", "dark hex uses light text");

const empty = churchBrandStyle(null, null);
assert(!hasChurchBrandTokens(empty), "no tokens without brand colors");

const branded = churchBrandStyle("#1f3d34", "#6f8f7f") as Record<string, string>;
assert(hasChurchBrandTokens(branded), "tokens present with brand colors");
assert(Boolean(branded["--brand-accent"]), "light accent");
assert(Boolean(branded["--brand-accent-dark"]), "dark accent");
assert(Boolean(branded["--brand-nav-hover"]), "light nav hover");
assert(Boolean(branded["--brand-nav-hover-dark"]), "dark nav hover");
assert(Boolean(branded["--brand-primary"]), "light primary");
assert(Boolean(branded["--brand-primary-dark"]), "dark primary");
assert(
  branded["--brand-accent"] !== branded["--brand-accent-dark"],
  "light and dark accent surfaces differ",
);
assert(
  branded["--accent"] === undefined,
  "must not freeze --accent inline (breaks dark mode)",
);

const primaryOnly = churchBrandStyle("#1f3d34", null) as Record<string, string>;
assert(Boolean(primaryOnly["--brand-accent-dark"]), "primary-only still has dark accent");

console.log("brand-theme.selfcheck: ok");
