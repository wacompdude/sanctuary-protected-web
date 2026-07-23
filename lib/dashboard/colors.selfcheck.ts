/**
 * Lightweight self-check for contrast helpers.
 * Run: npx --yes tsx lib/dashboard/colors.selfcheck.ts
 * (No project test runner is configured yet.)
 */
import {
  getAccessibleTextColor,
  getContrastRatio,
  isContrastAcceptable,
  isHexColor,
  normalizeHexColor,
  DASHBOARD_TEXT_DARK,
  DASHBOARD_TEXT_LIGHT,
} from "@/lib/dashboard/colors";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(isHexColor("#C0C0C0"), "silver hex should be valid");
assert(!isHexColor("red"), "named colors must be rejected");
assert(normalizeHexColor("#abc") === "#AABBCC", "short hex expands");
assert(normalizeHexColor("#ff1a1a") === "#FF1A1A", "hex normalizes uppercase");

assert(
  getAccessibleTextColor("#FFFFFF") === DASHBOARD_TEXT_DARK,
  "white background prefers dark text",
);
assert(
  getAccessibleTextColor("#1F2937") === DASHBOARD_TEXT_LIGHT,
  "dark background prefers light text",
);
assert(
  isContrastAcceptable(DASHBOARD_TEXT_DARK, "#FDE047"),
  "dark on yellow should pass AA",
);
assert(
  getContrastRatio(DASHBOARD_TEXT_LIGHT, "#FF1A1A") >= 3,
  "white on bright red should be reasonably readable",
);

console.log("dashboard color self-check passed");
