/**
 * Church-wide notification preference save (no database).
 * Run: npx --yes tsx lib/notifications/preference-save.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  churchWidePreferenceWrite,
  preferenceSaveOutcome,
} from "@/lib/notifications/preference-save";
import {
  deliverySuppressionForDisabledPreference,
  suppressionReasonFromSmsEligibility,
} from "@/lib/sms/eligibility";
import { smsPreferenceActionForEnrollmentCompletion } from "@/lib/sms/sms-preference";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function write(smsEnabled: boolean, extras?: { emailEnabled?: boolean; timezone?: string }) {
  return churchWidePreferenceWrite({
    organizationId: ORG,
    userId: USER,
    notificationType: "*",
    emailEnabled: extras?.emailEnabled ?? true,
    smsEnabled,
    pushEnabled: false,
    inAppEnabled: true,
    minimumSeverity: "informational",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "06:00",
    timezone: extras?.timezone ?? "America/Los_Angeles",
    digestFrequency: "immediate",
  });
}

function main() {
  const created = write(true, { emailEnabled: true });
  assert(created.mode === "upsert", "1 no-row save uses upsert, which inserts");
  assert(created.row.sms_enabled === true, "1 no-row + SMS enabled writes sms_enabled true");
  assert(created.row.notification_type === "*", "1 scope is church-wide *");
  assert(created.row.organization_id === ORG, "6 organization id is the active organization");
  assert(created.row.user_id === USER, "6 user id is the signed-in user");

  const disabled = write(false, { emailEnabled: true });
  assert(disabled.row.sms_enabled === false, "2 no-row + SMS disabled persists sms_enabled false");
  assert(disabled.row.email_enabled === true, "2 unrelated email default stays enabled");

  const enabled = write(true, { emailEnabled: false, timezone: "America/Chicago" });
  assert(enabled.row.sms_enabled === true, "3 existing false can be saved as true");
  assert(enabled.row.email_enabled === false, "5 email setting is preserved from the form");
  assert(enabled.row.push_enabled === false, "5 push setting is preserved from the form");
  assert(enabled.row.in_app_enabled === true, "5 in-app setting is preserved from the form");
  assert(enabled.row.minimum_severity === "informational", "5 severity is preserved from the form");
  assert(enabled.row.quiet_hours_enabled === false, "5 quiet hours flag is preserved from the form");
  assert(enabled.row.quiet_hours_start === "22:00", "5 quiet hours start is preserved from the form");
  assert(enabled.row.quiet_hours_end === "06:00", "5 quiet hours end is preserved from the form");
  assert(enabled.row.timezone === "America/Chicago", "5 timezone is preserved from the form");
  assert(enabled.row.digest_frequency === "immediate", "5 digest setting is preserved from the form");

  const turnedOff = write(false, { emailEnabled: false });
  assert(turnedOff.row.sms_enabled === false, "4 existing true can be saved as false");
  assert(turnedOff.row.email_enabled === false, "5 disabling SMS does not reset email");

  const failed = preferenceSaveOutcome("new row violates row-level security policy");
  assert(
    "error" in failed &&
      failed.error === "new row violates row-level security policy",
    "7 a write failure is returned",
  );
  assert(
    !("success" in preferenceSaveOutcome("write failed")),
    "7 a write failure is not treated as success",
  );
  const saved = preferenceSaveOutcome(null);
  assert("success" in saved && saved.success === true, "7 a clean write can succeed");

  assert(
    smsPreferenceActionForEnrollmentCompletion({
      existingSmsEnabled: null,
      consentGranted: true,
      phoneVerified: true,
      endpointActive: true,
      providerSuppressed: false,
    }) === "initialize",
    "8 enrollment helper still initializes a missing preference",
  );

  assert(
    deliverySuppressionForDisabledPreference("sms") === "channel_disabled",
    "9 missing or disabled SMS preference stays channel_disabled",
  );
  assert(
    suppressionReasonFromSmsEligibility("SMS_OPTED_OUT") === "user_opted_out",
    "9 consent opt-out stays user_opted_out",
  );
  assert(
    suppressionReasonFromSmsEligibility("SMS_SUPPRESSED") === "user_opted_out",
    "9 STOP stays user_opted_out",
  );

  const form = readRepo("components/notifications/notification-preferences-form.tsx");
  assert(form.includes("sms_enabled: false"), "no-row form defaults SMS off");
  assert(form.includes('name="sms_enabled"'), "SMS checkbox is submitted");
  assert(!form.includes("sms_enabled\" disabled"), "SMS checkbox is not disabled");
  assert(form.includes("state.error"), "save errors are shown");
  assert(form.includes("if (state.success) router.refresh()"), "successful save refreshes");

  const action = readRepo("app/(app)/notifications/actions.ts");
  const save = action.slice(
    action.indexOf("export async function updateMyNotificationPreferencesAction"),
    action.indexOf("export async function updateChurchNotificationSettingsAction"),
  );
  assert(save.includes(".upsert(write.row"), "save upserts the church-wide row");
  assert(save.includes("church.id"), "save uses the active organization");
  assert(save.includes("user.id"), "save uses the signed-in user");
  assert(save.includes('if ("error" in outcome) return outcome'), "save returns the write error");
  assert(save.includes("revalidatePath(\"/notifications/preferences\")"), "save revalidates preferences");

  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
  const smsSend = dispatch.slice(dispatch.indexOf("export async function sendSmsDelivery"));
  assert(
    smsSend.indexOf("reserveApplicationSmsSegments") > smsSend.indexOf("canSendSms"),
    "10 capacity reservation stays after eligibility",
  );

  console.log("preference-save.selfcheck: ok");
}

main();
