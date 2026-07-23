/**
 * Phase 6 security / isolation self-check (no DB required).
 * Run: npx --yes tsx lib/dashboard/security.selfcheck.ts
 */
import {
  canManageDashboardCustomization,
  canViewDashboardCustomization,
  canViewDashboardScheduleManagerBoxes,
} from "@/lib/dashboard/permissions";
import {
  assertDashboardChurchId,
  collectObsoleteDashboardBoxKeys,
  countCustomizedDashboardSettings,
  rejectBrowserSubmittedChurchId,
  sanitizeDashboardActionError,
} from "@/lib/dashboard/security";
import { validateDashboardSettingsUpdate } from "@/lib/dashboard/validation";
import { DASHBOARD_BOX_KEYS } from "@/lib/dashboard/types";
import { getDashboardBoxDefinition } from "@/lib/dashboard/dashboard-box-registry";
import { normalizeHexColor } from "@/lib/dashboard/colors";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// --- Permissions matrix ---
assert(
  !canManageDashboardCustomization("viewer"),
  "viewers cannot manage dashboard customization",
);
assert(
  !canManageDashboardCustomization("security_leader"),
  "security leaders cannot manage dashboard customization",
);
assert(
  canManageDashboardCustomization("administrator"),
  "administrators can manage dashboard customization",
);
assert(
  canViewDashboardCustomization("owner"),
  "owners can view dashboard customization",
);
assert(
  canViewDashboardScheduleManagerBoxes("security_leader"),
  "security leaders can see manager schedule boxes",
);
assert(
  !canViewDashboardScheduleManagerBoxes("security_member"),
  "security members cannot see manager-only schedule boxes",
);

// --- Church id guards (cross-church spoofing) ---
assert(
  assertDashboardChurchId("11111111-1111-4111-8111-111111111111") ===
    "11111111-1111-4111-8111-111111111111",
  "valid uuid church id accepted",
);
try {
  assertDashboardChurchId("not-a-church");
  throw new Error("expected invalid church id to throw");
} catch (error) {
  assert(
    error instanceof Error && /Invalid church context/.test(error.message),
    "invalid church id rejected",
  );
}

const spoof = new FormData();
spoof.set("church_id", "22222222-2222-4222-8222-222222222222");
try {
  rejectBrowserSubmittedChurchId(spoof);
  throw new Error("expected browser church_id to be rejected");
} catch (error) {
  assert(
    error instanceof Error && /cannot be submitted/.test(error.message),
    "browser church_id rejected",
  );
}

const clean = new FormData();
clean.set("settings_json", "[]");
rejectBrowserSubmittedChurchId(clean);

// --- Obsolete keys ---
assert(
  collectObsoleteDashboardBoxKeys([
    "active_incidents",
    "legacy_camera_feed",
    "active_incidents",
    "old_widget",
  ]).join(",") === "legacy_camera_feed,old_widget",
  "obsolete keys collected uniquely",
);

// --- Color / injection rejection ---
for (const bad of [
  "red",
  "rgb(255,0,0)",
  "rgba(0,0,0,0.5)",
  "url(https://evil.example)",
  "#FF00FF; background:url(x)",
  "javascript:alert(1)",
  "--tw-bg-opacity",
]) {
  assert(normalizeHexColor(bad) === null, `reject color payload: ${bad}`);
}

// --- Full payload validation (registry completeness + visibility) ---
const full = DASHBOARD_BOX_KEYS.map((key, index) => {
  const definition = getDashboardBoxDefinition(key)!;
  return {
    boxKey: key,
    isVisible: true,
    displayOrder: (index + 1) * 10,
    backgroundColor: definition.defaultBackgroundColor,
    textColor: definition.defaultTextColor,
    useAutomaticTextColor: true,
  };
});

const ok = validateDashboardSettingsUpdate(full);
assert(ok.ok, "full registry payload should validate");

const withUnknown = validateDashboardSettingsUpdate([
  ...full.slice(0, -1),
  {
    boxKey: "not_a_real_box",
    isVisible: true,
    displayOrder: 999,
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
    useAutomaticTextColor: true,
  },
]);
assert(!withUnknown.ok, "unknown box keys rejected");

const allHidden = validateDashboardSettingsUpdate(
  full.map((row) => ({ ...row, isVisible: false })),
);
assert(!allHidden.ok, "at least one visible box required");

const badColor = validateDashboardSettingsUpdate(
  full.map((row, index) =>
    index === 0
      ? { ...row, backgroundColor: "red", useAutomaticTextColor: false }
      : row,
  ),
);
assert(!badColor.ok, "named colors rejected on save validation");

assert(
  countCustomizedDashboardSettings(full) === 0,
  "defaults count as not customized",
);
assert(
  countCustomizedDashboardSettings([
    { ...full[0]!, backgroundColor: "#123456", useAutomaticTextColor: true },
    ...full.slice(1),
  ]) === 1,
  "custom background counts as customized",
);

assert(
  sanitizeDashboardActionError(
    new Error("permission denied by rls xyz"),
    "fallback",
  ) === "fallback",
  "raw rls noise not leaked",
);
assert(
  sanitizeDashboardActionError(
    new Error("You do not have permission to customize the dashboard."),
    "fallback",
  ) === "You do not have permission to customize the dashboard.",
  "safe permission errors preserved",
);

console.log("dashboard security self-check passed");
