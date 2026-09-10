import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { smsConsentPolicyVersions } from "@/lib/sms/consent-copy";
import { inspectMobileNumber } from "@/lib/sms/phone";
import type { ConsentStatus } from "@/lib/notifications/endpoints/types";

export type SmsEnrollmentState =
  | "NOT_ENROLLED"
  | "PENDING_VERIFICATION"
  | "OPTED_IN"
  | "OPTED_OUT"
  | "SUSPENDED"
  | "INVALID_NUMBER";

export type SmsConsentEventType =
  | "CONSENT_PRESENTED"
  | "CONSENT_ACCEPTED"
  | "VERIFICATION_SENT"
  | "PHONE_VERIFIED"
  | "SMS_ENABLED"
  | "SMS_OPTED_OUT"
  | "SMS_REOPTED_IN"
  | "PHONE_CHANGED"
  | "SMS_SUSPENDED"
  | "SMS_SUPPRESSED"
  | "HELP_REQUESTED";

export function enrollmentStateFromEndpoint(input: {
  consentStatus?: ConsentStatus | string | null;
  isVerified?: boolean;
  status?: string | null;
  suppressedAt?: string | null;
}): SmsEnrollmentState {
  if (input.suppressedAt || input.status === "revoked") return "SUSPENDED";
  if (input.consentStatus === "revoked" || input.consentStatus === "denied") {
    return "OPTED_OUT";
  }
  if (input.consentStatus === "granted" && input.isVerified && input.status === "active") {
    return "OPTED_IN";
  }
  if (input.consentStatus === "granted" || input.consentStatus === "pending") {
    return "PENDING_VERIFICATION";
  }
  return "NOT_ENROLLED";
}

export async function recordSmsConsentEvent(params: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  endpointId?: string | null;
  phoneE164?: string | null;
  eventType: SmsConsentEventType;
  source?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const versions = smsConsentPolicyVersions();
  const { error } = await params.supabase.from("sms_consent_events").insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    endpoint_id: params.endpointId ?? null,
    phone_e164: params.phoneE164 ?? null,
    event_type: params.eventType,
    source: params.source ?? null,
    consent_text_version: versions.consentTextVersion,
    privacy_policy_version: versions.privacyPolicyVersion,
    terms_version: versions.termsVersion,
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ?? null,
    metadata: params.metadata ?? {},
  });
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.error("sms_consent_events insert failed:", error.message);
  }
}

export async function findPrimarySmsEndpoint(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("notification_endpoints")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("channel", "sms")
    .neq("status", "revoked")
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data;
}

export async function findSmsEndpointByDestination(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  e164: string,
) {
  const { data, error } = await supabase
    .from("notification_endpoints")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("channel", "sms")
    .eq("normalized_destination", e164)
    .neq("status", "revoked")
    .maybeSingle();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data;
}

export async function upsertSmsEndpointForPhone(params: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  membershipId: string;
  phoneRaw: string;
}) {
  const inspected = inspectMobileNumber(params.phoneRaw);
  if (!inspected.e164) {
    return { error: inspected.error ?? "Enter a valid mobile number." };
  }
  if (!inspected.supported) {
    return { error: inspected.error ?? "SMS messaging is not currently available for this mobile number." };
  }

  const byDestination = await findSmsEndpointByDestination(
    params.supabase,
    params.organizationId,
    params.userId,
    inspected.e164,
  );
  if (byDestination) {
    return {
      endpoint: byDestination,
      e164: inspected.e164,
      region: inspected.region,
    };
  }

  const existing = await findPrimarySmsEndpoint(
    params.supabase,
    params.organizationId,
    params.userId,
  );

  if (existing) {
    await params.supabase
      .from("notification_endpoints")
      .update({ is_primary: false })
      .eq("id", existing.id);
  }

  const row = {
    organization_id: params.organizationId,
    user_id: params.userId,
    membership_id: params.membershipId,
    channel: "sms",
    destination: params.phoneRaw.trim(),
    normalized_destination: inspected.e164,
    label: "Mobile phone",
    is_primary: true,
    is_verified: false,
    verified_at: null,
    status: "unverified",
    consent_status: "unknown",
    consent_recorded_at: null,
    consent_source: "user_profile",
    consent_disclosure_version: null,
    destination_region: inspected.region,
  };

  const { data, error } = await params.supabase
    .from("notification_endpoints")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) {
    const retry = await findSmsEndpointByDestination(
      params.supabase,
      params.organizationId,
      params.userId,
      inspected.e164,
    );
    if (retry) {
      return { endpoint: retry, e164: inspected.e164, region: inspected.region };
    }
    return { error: "Unable to save the SMS destination." };
  }
  return { endpoint: data, e164: inspected.e164, region: inspected.region };
}

export async function handleSmsPhoneNumberChange(params: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  actorUserId: string;
  previousPhone: string | null;
  nextPhone: string | null;
  source: "USER_PROFILE" | "ADMIN_ASSISTED";
  ipAddress?: string | null;
}): Promise<void> {
  try {
    const previous = params.previousPhone
      ? inspectMobileNumber(params.previousPhone).e164
      : null;
    const next = params.nextPhone ? inspectMobileNumber(params.nextPhone).e164 : null;
    if (previous === next) return;

    const { data: endpoints } = await params.supabase
      .from("notification_endpoints")
      .select("id, normalized_destination, consent_status")
      .eq("organization_id", params.organizationId)
      .eq("user_id", params.userId)
      .eq("channel", "sms")
      .neq("status", "revoked");

    for (const row of endpoints ?? []) {
      const destination = String(row.normalized_destination ?? "");
      if (previous && destination === previous) {
        await params.supabase
          .from("notification_endpoints")
          .update({
            is_primary: false,
            status: row.consent_status === "granted" ? "disabled" : "unverified",
          })
          .eq("id", row.id);
      }
    }

    await recordSmsConsentEvent({
      supabase: params.supabase,
      organizationId: params.organizationId,
      userId: params.userId,
      phoneE164: next,
      eventType: "PHONE_CHANGED",
      source: params.source,
      ipAddress: params.ipAddress,
      metadata: {
        previous_phone_present: Boolean(previous),
        actor_user_id: params.actorUserId,
        consent_transferred: false,
      },
    });

    await writeAuditLog(params.supabase, {
      organizationId: params.organizationId,
      userId: params.actorUserId,
      action: AuditAction.NOTIFICATION_ENDPOINT_DISABLED,
      entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
      entityId: params.userId,
      metadata: {
        reason: "phone_changed",
        sms_consent_transferred: false,
      },
      ipAddress: params.ipAddress,
    });
  } catch (error) {
    console.error(
      "SMS phone-change consent reset failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
