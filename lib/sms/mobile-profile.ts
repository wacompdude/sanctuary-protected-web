import { createAdminClient } from "@/lib/supabase/admin";
import { requireMobileMfaContext } from "@/lib/mfa/mobile-api";
import { mobileNotificationCorsHeaders } from "@/lib/notifications/mobile-api";
import {
  enrollmentStateFromEndpoint,
  findPrimarySmsEndpoint,
  handleSmsPhoneNumberChange,
  recordSmsConsentEvent,
  upsertSmsEndpointForPhone,
} from "@/lib/sms/consent";
import {
  SMS_CONSENT_BODY,
  SMS_CONSENT_CHECKBOX_LABEL,
  SMS_CONSENT_FREQUENCY,
  SMS_CONSENT_NOT_REQUIRED,
  SMS_CONSENT_RATES,
  SMS_CONSENT_SOURCE_PROFILE_MOBILE,
  SMS_CONSENT_STOP_HELP,
  SMS_CONSENT_TEXT_VERSION,
  SMS_ENABLE_BUTTON_LABEL,
  SMS_PRIVACY_HREF,
  SMS_TERMS_HREF,
  smsConsentPolicyVersions,
  smsOnScreenConsentSnapshot,
} from "@/lib/sms/consent-copy";
import { listSmsDialingRegions } from "@/lib/sms/dialing-regions";
import { inspectMobileNumber } from "@/lib/sms/phone";
import {
  formatNationalNanpDisplay,
  normalizeNanpNationalInput,
  phoneEntryMode,
} from "@/lib/sms/phone-entry";
import {
  sendSmsEnrollmentCode,
  sendSmsEnrollmentConfirmation,
  verifySmsEnrollmentCode,
} from "@/lib/sms/verify";

export function mobileProfileSmsCorsHeaders() {
  return mobileNotificationCorsHeaders();
}

function statusLabel(state: string, pending = false): string {
  if (state === "OPTED_IN") return "Enabled";
  if (state === "OPTED_OUT") return "Opted Out";
  if (state === "PENDING_VERIFICATION" || pending) return "Pending verification";
  if (state === "SUSPENDED") return "Opted Out";
  return "Not Enrolled";
}

async function activeMembership(
  userId: string,
  organizationId: string,
): Promise<{ id: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data?.id) return null;
  return { id: String(data.id) };
}

export async function readMobileProfileSms(
  request: Request,
  organizationId: string,
) {
  const gate = await requireMobileMfaContext(request, organizationId);
  if (!gate.ok) return { status: gate.status, body: gate.body };

  const admin = createAdminClient();
  const membership = await activeMembership(gate.ctx.userId, organizationId);
  if (!membership) {
    return {
      status: 403,
      body: { status: "forbidden", error: "Choose an organization you belong to." },
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", gate.ctx.userId)
    .maybeSingle();
  const phone = typeof profile?.phone === "string" ? profile.phone : null;
  const endpoint = await findPrimarySmsEndpoint(
    admin,
    organizationId,
    gate.ctx.userId,
  );
  const enrollmentState = enrollmentStateFromEndpoint({
    consentStatus: endpoint ? String(endpoint.consent_status) : "unknown",
    isVerified: Boolean(endpoint?.is_verified),
    status: endpoint ? String(endpoint.status) : null,
    suppressedAt: (endpoint?.suppressed_at as string | null | undefined) ?? null,
  });
  const regions = await listSmsDialingRegions(admin);
  const entry = phoneEntryMode(regions.regions);

  return {
    status: 200,
    body: {
      status: "ok",
      phoneE164: phone ? inspectMobileNumber(phone).e164 : null,
      phoneDisplay: formatNationalNanpDisplay(phone),
      enrollmentState,
      statusLabel: statusLabel(enrollmentState),
      verified: enrollmentState === "OPTED_IN",
      consentPreselected: false,
      showCountrySelector: entry.kind === "selector",
      dialingRegions:
        entry.kind === "selector"
          ? entry.regions.map((region) => ({
              regionCode: region.regionCode,
              displayName: region.displayName,
              dialingCode: region.dialingCode,
            }))
          : [],
      consentBody: SMS_CONSENT_BODY,
      consentCheckbox: SMS_CONSENT_CHECKBOX_LABEL,
      consentDetails: `${SMS_CONSENT_FREQUENCY} ${SMS_CONSENT_RATES} ${SMS_CONSENT_STOP_HELP} ${SMS_CONSENT_NOT_REQUIRED}`,
      enableLabel: SMS_ENABLE_BUTTON_LABEL,
      privacyPath: SMS_PRIVACY_HREF,
      termsPath: SMS_TERMS_HREF,
    },
  };
}

export async function saveMobileProfilePhone(input: {
  request: Request;
  organizationId: string;
  phone: string;
}) {
  const gate = await requireMobileMfaContext(input.request, input.organizationId);
  if (!gate.ok) return { status: gate.status, body: gate.body };
  const trimmed = input.phone.trim();
  const normalized = trimmed ? normalizeNanpNationalInput(trimmed) : { e164: null as string | null };
  if ("error" in normalized) {
    return { status: 400, body: { status: "error", error: normalized.error } };
  }

  const admin = createAdminClient();
  const membership = await activeMembership(gate.ctx.userId, input.organizationId);
  if (!membership) {
    return {
      status: 403,
      body: { status: "forbidden", error: "Choose an organization you belong to." },
    };
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", gate.ctx.userId)
    .maybeSingle();
  const previous = typeof existing?.phone === "string" ? existing.phone : null;
  const next = normalized.e164;

  const { error } = await admin
    .from("profiles")
    .update({ phone: next })
    .eq("id", gate.ctx.userId);
  if (error) return { status: 400, body: { status: "error", error: "Enter a 10-digit phone number." } };

  if ((previous ?? null) !== (next ?? null)) {
    await handleSmsPhoneNumberChange({
      supabase: admin,
      organizationId: input.organizationId,
      userId: gate.ctx.userId,
      actorUserId: gate.ctx.userId,
      previousPhone: previous,
      nextPhone: next,
      source: "USER_PROFILE",
    });
  }

  return {
    status: 200,
    body: {
      status: "ok",
      phoneE164: next,
      phoneDisplay: formatNationalNanpDisplay(next),
      consentGranted: false,
    },
  };
}

export async function startMobileSmsEnrollment(input: {
  request: Request;
  organizationId: string;
  phone: string;
  consent: boolean;
}) {
  const gate = await requireMobileMfaContext(input.request, input.organizationId);
  if (!gate.ok) return { status: gate.status, body: gate.body };
  if (!input.consent) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "Confirm the SMS consent statement before continuing.",
      },
    };
  }

  const normalized = normalizeNanpNationalInput(input.phone);
  if ("error" in normalized) {
    return { status: 400, body: { status: "error", error: normalized.error } };
  }
  const inspected = inspectMobileNumber(normalized.e164);
  if (!inspected.supported || !inspected.e164) {
    return {
      status: 400,
      body: {
        status: "error",
        error: inspected.error ?? "Enter a 10-digit phone number.",
      },
    };
  }

  const admin = createAdminClient();
  const membership = await activeMembership(gate.ctx.userId, input.organizationId);
  if (!membership) {
    return {
      status: 403,
      body: { status: "forbidden", error: "Choose an organization you belong to." },
    };
  }

  const upsert = await upsertSmsEndpointForPhone({
    supabase: admin,
    organizationId: input.organizationId,
    userId: gate.ctx.userId,
    membershipId: membership.id,
    phoneRaw: inspected.e164,
  });
  if ("error" in upsert && upsert.error) {
    return { status: 400, body: { status: "error", error: upsert.error } };
  }
  const endpoint = upsert.endpoint as { id: string } | null | undefined;
  if (!endpoint?.id) {
    return { status: 400, body: { status: "error", error: "Unable to save SMS enrollment." } };
  }

  const versions = smsConsentPolicyVersions();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("notification_endpoints")
    .update({
      consent_status: "pending",
      consent_recorded_at: now,
      consent_source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
      consent_disclosure_version: SMS_CONSENT_TEXT_VERSION,
      privacy_policy_version: versions.privacyPolicyVersion,
      terms_version: versions.termsVersion,
      destination_region: inspected.region,
      status: "unverified",
      is_verified: false,
      is_primary: true,
    })
    .eq("id", endpoint.id)
    .eq("user_id", gate.ctx.userId);
  if (error) {
    return { status: 400, body: { status: "error", error: "Unable to save SMS enrollment." } };
  }

  await recordSmsConsentEvent({
    supabase: admin,
    organizationId: input.organizationId,
    userId: gate.ctx.userId,
    endpointId: endpoint.id,
    phoneE164: inspected.e164,
    eventType: "CONSENT_ACCEPTED",
    source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
    metadata: {
      sms_opted_in: false,
      sms_consent_source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
      sms_consent_version: SMS_CONSENT_TEXT_VERSION,
      sms_consent_text: smsOnScreenConsentSnapshot(),
      sms_phone_verified: false,
    },
  });

  const sent = await sendSmsEnrollmentCode({
    organizationId: input.organizationId,
    userId: gate.ctx.userId,
    phoneE164: inspected.e164,
  });
  if (sent.ok) {
    await recordSmsConsentEvent({
      supabase: admin,
      organizationId: input.organizationId,
      userId: gate.ctx.userId,
      endpointId: endpoint.id,
      phoneE164: inspected.e164,
      eventType: "VERIFICATION_SENT",
      source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
    });
  }

  return {
    status: 200,
    body: {
      status: "ok",
      enrollmentState: "PENDING_VERIFICATION",
      statusLabel: statusLabel("PENDING_VERIFICATION", true),
      verificationSent: sent.ok,
      error: sent.ok
        ? undefined
        : "Consent was recorded. We could not send a verification text yet.",
    },
  };
}

export async function verifyMobileSmsEnrollment(input: {
  request: Request;
  organizationId: string;
  code: string;
}) {
  const gate = await requireMobileMfaContext(input.request, input.organizationId);
  if (!gate.ok) return { status: gate.status, body: gate.body };
  const admin = createAdminClient();
  const endpoint = await findPrimarySmsEndpoint(
    admin,
    input.organizationId,
    gate.ctx.userId,
  );
  if (!endpoint) {
    return {
      status: 400,
      body: { status: "error", error: "Add a mobile number before verifying SMS." },
    };
  }
  const phoneE164 = String(endpoint.normalized_destination);
  const verified = await verifySmsEnrollmentCode({
    organizationId: input.organizationId,
    userId: gate.ctx.userId,
    phoneE164,
    code: input.code.trim(),
  });
  if (!verified.ok) {
    return {
      status: 400,
      body: { status: "error", error: verified.error ?? "Unable to verify that code." },
    };
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("notification_endpoints")
    .update({
      consent_status: "granted",
      is_verified: true,
      verified_at: now,
      status: "active",
      suppressed_at: null,
      suppression_source: null,
    })
    .eq("id", endpoint.id)
    .eq("user_id", gate.ctx.userId);
  if (error) {
    return { status: 400, body: { status: "error", error: "Unable to verify that code." } };
  }

  await recordSmsConsentEvent({
    supabase: admin,
    organizationId: input.organizationId,
    userId: gate.ctx.userId,
    endpointId: String(endpoint.id),
    phoneE164,
    eventType: "PHONE_VERIFIED",
    source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
    metadata: { sms_phone_verified: true },
  });
  await recordSmsConsentEvent({
    supabase: admin,
    organizationId: input.organizationId,
    userId: gate.ctx.userId,
    endpointId: String(endpoint.id),
    phoneE164,
    eventType: "SMS_ENABLED",
    source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
    metadata: {
      sms_opted_in: true,
      sms_phone_verified: true,
      sms_consent_source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
      sms_consent_version: SMS_CONSENT_TEXT_VERSION,
    },
  });
  await sendSmsEnrollmentConfirmation(phoneE164);

  return {
    status: 200,
    body: {
      status: "ok",
      enrollmentState: "OPTED_IN",
      statusLabel: statusLabel("OPTED_IN"),
    },
  };
}

export async function optOutMobileSms(input: {
  request: Request;
  organizationId: string;
}) {
  const gate = await requireMobileMfaContext(input.request, input.organizationId);
  if (!gate.ok) return { status: gate.status, body: gate.body };
  const admin = createAdminClient();
  const endpoint = await findPrimarySmsEndpoint(
    admin,
    input.organizationId,
    gate.ctx.userId,
  );
  if (!endpoint) {
    return { status: 400, body: { status: "error", error: "SMS messaging is not enrolled." } };
  }
  const { error } = await admin
    .from("notification_endpoints")
    .update({
      consent_status: "revoked",
      consent_source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
      status: "disabled",
    })
    .eq("id", endpoint.id)
    .eq("user_id", gate.ctx.userId);
  if (error) {
    return { status: 400, body: { status: "error", error: "Unable to opt out of SMS." } };
  }
  await recordSmsConsentEvent({
    supabase: admin,
    organizationId: input.organizationId,
    userId: gate.ctx.userId,
    endpointId: String(endpoint.id),
    phoneE164: String(endpoint.normalized_destination),
    eventType: "SMS_OPTED_OUT",
    source: SMS_CONSENT_SOURCE_PROFILE_MOBILE,
    metadata: { cleared_stop: false, cleared_suppression: false },
  });
  return {
    status: 200,
    body: {
      status: "ok",
      enrollmentState: "OPTED_OUT",
      statusLabel: statusLabel("OPTED_OUT"),
    },
  };
}
