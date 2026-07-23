import { isDashboardBoxKey } from "@/lib/dashboard/dashboard-box-registry";
import { getDashboardBoxDefinition } from "@/lib/dashboard/dashboard-box-registry";
import { settingsMatchSystemDefault } from "@/lib/dashboard/validation";
import type { DashboardBoxSettingInput } from "@/lib/dashboard/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Active church id must be a UUID from auth context — never from the browser. */
export function assertDashboardChurchId(churchId: string): string {
  const trimmed = churchId.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error("Invalid church context for dashboard settings.");
  }
  return trimmed;
}

/**
 * Guard against clients that try to spoof tenant scope via FormData.
 * Church scope always comes from getAuthenticatedUserWithChurch().
 */
export function rejectBrowserSubmittedChurchId(formData: FormData): void {
  const submitted = formData.get("church_id") ?? formData.get("churchId");
  if (submitted != null && String(submitted).trim() !== "") {
    throw new Error(
      "Church id cannot be submitted from the browser for dashboard settings.",
    );
  }
}

export function collectObsoleteDashboardBoxKeys(keys: string[]): string[] {
  const obsolete: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const normalized = String(key ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (!isDashboardBoxKey(normalized)) {
      obsolete.push(normalized);
    }
  }
  return obsolete;
}

export function countCustomizedDashboardSettings(
  settings: DashboardBoxSettingInput[],
): number {
  return settings.filter((row) => {
    const definition = getDashboardBoxDefinition(row.boxKey);
    if (!definition) return false;
    return !settingsMatchSystemDefault({ ...row, definition });
  }).length;
}

const SAFE_DASHBOARD_ACTION_ERRORS = [
  "You do not have permission to customize the dashboard.",
  "Invalid church context for dashboard settings.",
  "Church id cannot be submitted from the browser for dashboard settings.",
  "Invalid dashboard settings payload.",
  "Fix the highlighted dashboard settings.",
  "No dashboard box settings were submitted.",
  "Duplicate dashboard box settings are not allowed.",
  "Keep at least one dashboard box visible.",
  "One or more dashboard box keys are invalid.",
  "Colors must be stored as #RRGGBB.",
  "Unable to save dashboard settings for this church.",
] as const;

export function sanitizeDashboardActionError(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message;
  if ((SAFE_DASHBOARD_ACTION_ERRORS as readonly string[]).includes(message)) {
    return message;
  }
  if (
    message.startsWith("Unknown dashboard box") ||
    message.startsWith("Missing settings for dashboard box") ||
    message.startsWith("Dashboard customization is not configured yet.")
  ) {
    return message;
  }
  return fallback;
}
