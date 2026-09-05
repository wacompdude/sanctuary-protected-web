/**
 * Dashboard display: auto-sort + zero-count dimming (no database).
 * Run: npx --yes tsx lib/dashboard/display.selfcheck.ts
 */
import {
  DASHBOARD_TEXT_DARK,
  DASHBOARD_TEXT_LIGHT,
  deriveDashboardBoxPalette,
  getContrastRatio,
  mixHexColor,
  normalizeHexColor,
} from "@/lib/dashboard/colors";
import {
  deriveZeroCountDashboardBoxPalette,
  getDashboardBoxDisplayPalette,
  isDashboardBoxZeroCount,
} from "@/lib/dashboard/presentation";
import {
  normalizeDashboardItemCount,
  sortDashboardBoxes,
} from "@/lib/dashboard/sort";
import { DEFAULT_DASHBOARD_DISPLAY_SETTINGS } from "@/lib/dashboard/types";
import { canManageDashboardCustomization } from "@/lib/dashboard/permissions";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function keysOf(
  boxes: Array<{ key: string }>,
): string {
  return boxes.map((box) => box.key).join(",");
}

const manual = [
  { key: "safety", itemCount: 2, manualOrder: 10 },
  { key: "incidents", itemCount: 7, manualOrder: 20 },
  { key: "training", itemCount: 0, manualOrder: 30 },
  { key: "events", itemCount: 3, manualOrder: 40 },
];

assert(
  DEFAULT_DASHBOARD_DISPLAY_SETTINGS.sortByActiveCount === false,
  "existing churches default to manual order",
);

assert(
  keysOf(sortDashboardBoxes(manual, false)) ===
    "safety,incidents,training,events",
  "auto-sort off preserves manual order",
);

const reorderedManual = [
  { key: "events", itemCount: 3, manualOrder: 10 },
  { key: "safety", itemCount: 2, manualOrder: 20 },
  { key: "incidents", itemCount: 7, manualOrder: 30 },
  { key: "training", itemCount: 0, manualOrder: 40 },
];
assert(
  keysOf(sortDashboardBoxes(reorderedManual, false)) ===
    "events,safety,incidents,training",
  "changed manual order is used when auto-sort is off",
);

assert(
  keysOf(sortDashboardBoxes(manual, true)) ===
    "incidents,events,safety,training",
  "auto-sort on uses highest count first",
);

assert(
  keysOf(sortDashboardBoxes(manual, false)) ===
    "safety,incidents,training,events",
  "auto-sort off again restores saved manual order",
);

assert(
  keysOf(
    sortDashboardBoxes(
      [
        { key: "a", itemCount: 5, manualOrder: 10 },
        { key: "b", itemCount: 3, manualOrder: 20 },
        { key: "c", itemCount: 1, manualOrder: 30 },
      ],
      true,
    ),
  ) === "a,b,c",
  "counts 5,3,1 stay 5,3,1",
);

assert(
  keysOf(
    sortDashboardBoxes(
      [
        { key: "a", itemCount: 1, manualOrder: 10 },
        { key: "b", itemCount: 8, manualOrder: 20 },
        { key: "c", itemCount: 4, manualOrder: 30 },
      ],
      true,
    ),
  ) === "b,c,a",
  "counts 1,8,4 display 8,4,1",
);

const ties = [
  { key: "incidents", itemCount: 3, manualOrder: 10 },
  { key: "safety", itemCount: 3, manualOrder: 20 },
  { key: "events", itemCount: 1, manualOrder: 30 },
  { key: "training", itemCount: 1, manualOrder: 40 },
];
assert(
  keysOf(sortDashboardBoxes(ties, true)) ===
    "incidents,safety,events,training",
  "equal counts use manual order as tie-breaker",
);

const zeros = [
  { key: "training", itemCount: 0, manualOrder: 10 },
  { key: "medical", itemCount: 0, manualOrder: 20 },
  { key: "cameras", itemCount: 0, manualOrder: 30 },
];
assert(
  keysOf(sortDashboardBoxes(zeros, true)) === "training,medical,cameras",
  "multiple zero-count boxes keep manual relative order",
);

const original = [...manual];
sortDashboardBoxes(manual, true);
assert(
  keysOf(manual) === keysOf(original),
  "sort helper does not mutate the source array",
);

assert(normalizeDashboardItemCount(null) === 0, "null count is 0");
assert(normalizeDashboardItemCount(undefined) === 0, "undefined count is 0");
assert(normalizeDashboardItemCount(Number.NaN) === 0, "NaN count is 0");
assert(normalizeDashboardItemCount(-4) === 0, "negative count is 0");
assert(normalizeDashboardItemCount(7.9) === 7, "count truncates");
assert(isDashboardBoxZeroCount(0), "0 is zero-count");
assert(!isDashboardBoxZeroCount(1), "1 is not zero-count");

const configuredBlue = "#2563EB";
const configuredText = "#FFFFFF";
const storedPalette = deriveDashboardBoxPalette(configuredBlue, configuredText);
const zeroLight = getDashboardBoxDisplayPalette({
  configuredBackground: configuredBlue,
  configuredText,
  itemCount: 0,
  theme: "light",
});
const zeroDark = getDashboardBoxDisplayPalette({
  configuredBackground: configuredBlue,
  configuredText,
  itemCount: 0,
  theme: "dark",
});
const positive = getDashboardBoxDisplayPalette({
  configuredBackground: configuredBlue,
  configuredText,
  itemCount: 1,
  theme: "light",
});

assert(
  storedPalette.backgroundColor === normalizeHexColor(configuredBlue),
  "configured palette keeps saved color",
);
assert(
  zeroLight.backgroundColor !== storedPalette.backgroundColor,
  "zero-count light palette is subdued",
);
assert(
  zeroDark.backgroundColor !== storedPalette.backgroundColor,
  "zero-count dark palette is subdued",
);
assert(
  zeroLight.backgroundColor ===
    mixHexColor(configuredBlue, "#FFFFFF", 0.5),
  "light mode blends 50% toward white",
);
assert(
  zeroDark.backgroundColor ===
    mixHexColor(configuredBlue, "#111827", 0.5),
  "dark mode blends 50% toward dark surface",
);
assert(
  positive.backgroundColor === storedPalette.backgroundColor,
  "positive count uses saved color",
);
assert(
  getDashboardBoxDisplayPalette({
    configuredBackground: configuredBlue,
    configuredText,
    itemCount: 0,
    theme: "light",
  }).backgroundColor !== storedPalette.backgroundColor &&
    storedPalette.backgroundColor === normalizeHexColor(configuredBlue),
  "dimming never mutates the configured color",
);

const backToPositive = getDashboardBoxDisplayPalette({
  configuredBackground: configuredBlue,
  configuredText,
  itemCount: 1,
  theme: "light",
});
assert(
  backToPositive.backgroundColor === storedPalette.backgroundColor,
  "count 0→1 restores configured color",
);
const backToZero = getDashboardBoxDisplayPalette({
  configuredBackground: configuredBlue,
  configuredText,
  itemCount: 0,
  theme: "light",
});
assert(
  backToZero.backgroundColor === zeroLight.backgroundColor,
  "count 1→0 reapplies subdued color",
);

assert(
  getContrastRatio(zeroLight.textColor, zeroLight.backgroundColor) >= 4.5,
  "zero-count light text meets contrast",
);
assert(
  getContrastRatio(zeroDark.textColor, zeroDark.backgroundColor) >= 4.5,
  "zero-count dark text meets contrast",
);
assert(
  deriveZeroCountDashboardBoxPalette(configuredBlue, configuredText, "light")
    .textColor === DASHBOARD_TEXT_DARK ||
    deriveZeroCountDashboardBoxPalette(configuredBlue, configuredText, "light")
      .textColor === DASHBOARD_TEXT_LIGHT,
  "zero-count text is a readable auto color",
);

assert(
  !canManageDashboardCustomization("viewer"),
  "viewers still cannot customize dashboard",
);
assert(
  !canManageDashboardCustomization("security_member"),
  "security members still cannot customize dashboard",
);
assert(
  canManageDashboardCustomization("administrator"),
  "administrators still can customize dashboard",
);

console.log("dashboard display self-check passed");
