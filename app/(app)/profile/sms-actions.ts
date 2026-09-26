"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import type { ActionState } from "@/lib/organization/types";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, getRequestUserAgent } from "@/lib/audit/request-ip";
import {
  SMS_CONSENT_SOURCE_PROFILE_WEB,
  SMS_CONSENT_TEXT_VERSION,
  smsConsentPolicyVersions,
  smsOnScreenConsentSnapshot,
} from "@/lib/sms/consent-copy";
import {
  findPrimarySmsEndpoint,
  findSmsEndpointByDestination,
  recordSmsConsentEvent,
  upsertSmsEndpointForPhone,
} from "@/lib/sms/consent";
import {
  CARRIER_STOP_MESSAGE,
  retirePreviousSmsPatch,
  verifiedEnrollmentPatch,
} from "@/lib/sms/phone-replacement";
import { inspectMobileNumber } from "@/lib/sms/phone";
import {
  findOpenSmsEnrollmentChallenge,
  sendSmsEnrollmentCode,
  sendSmsEnrollmentConfirmation,
  verifySmsEnrollmentCode,
} from "@/lib/sms/verify";

function revalidateSms() {
  revalidatePath("/profile");
  revalidatePath("/notifications/preferences");
}

function checkboxOn(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

export async function startSmsEnrollmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const agreed = checkboxOn(formData, "sms_consent");
    if (!agreed) {
      return {
        error: "Confirm the SMS consent statement before continuing.",
        fieldErrors: { sms_consent: "You must agree before enabling SMS messaging." },
      };
    }

    const phoneRaw = String(formData.get("phone") ?? "").trim();
    const inspected = inspectMobileNumber(phoneRaw);
    if (!inspected.e164) {
      return { error: inspected.error ?? "Enter a valid mobile number." };
    }
    if (!inspected.supported) {
      return { error: inspected.error };
    }

    const upsert = await upsertSmsEndpointForPhone({
      supabase,
      organizationId: church.id,
      userId: user.id,
      membershipId: membership.id,
      phoneRaw,
    });
    if ("error" in upsert && upsert.error) {
      return { error: upsert.error };
    }
    const endpoint = upsert.endpoint as {
      id: string;
      suppressed_at?: string | null;
      status?: string | null;
      is_verified?: boolean | null;
      consent_status?: string | null;
      normalized_destination?: string | null;
    } | null | undefined;
    if (!endpoint?.id) {
      return { error: "Unable to save SMS enrollment." };
    }
    if (endpoint.suppressed_at) {
      return { error: CARRIER_STOP_MESSAGE };
    }
    const alreadyActive =
      endpoint.status === "active" &&
      endpoint.is_verified &&
      endpoint.consent_status === "granted" &&
      String(endpoint.normalized_destination ?? "") === inspected.e164;
    if (alreadyActive) {
      return { error: "This number is already enrolled for SMS messaging." };
    }
    const versions = smsConsentPolicyVersions();
    const now = new Date().toISOString();
    const ipAddress = await getRequestIpAddress();
    const userAgent = await getRequestUserAgent();

    const { error } = await supabase
      .from("notification_endpoints")
      .update({
        consent_status: "pending",
        consent_recorded_at: now,
        consent_source: SMS_CONSENT_SOURCE_PROFILE_WEB,
        consent_disclosure_version: SMS_CONSENT_TEXT_VERSION,
        privacy_policy_version: versions.privacyPolicyVersion,
        terms_version: versions.termsVersion,
        destination_region: inspected.region,
        status: "unverified",
        is_verified: false,
      })
      .eq("id", endpoint.id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    await recordSmsConsentEvent({
      supabase,
      organizationId: church.id,
      userId: user.id,
      endpointId: endpoint.id,
      phoneE164: inspected.e164,
      eventType: "CONSENT_ACCEPTED",
      source: SMS_CONSENT_SOURCE_PROFILE_WEB,
      ipAddress,
      userAgent,
      metadata: {
        sms_opted_in: false,
        sms_consent_source: SMS_CONSENT_SOURCE_PROFILE_WEB,
        sms_consent_version: SMS_CONSENT_TEXT_VERSION,
        sms_consent_text: smsOnScreenConsentSnapshot(),
        sms_phone_verified: false,
      },
    });

    const sent = await sendSmsEnrollmentCode({
      organizationId: church.id,
      userId: user.id,
      phoneE164: inspected.e164,
    });
    if (sent.ok) {
      await recordSmsConsentEvent({
        supabase,
        organizationId: church.id,
        userId: user.id,
        endpointId: endpoint.id,
        phoneE164: inspected.e164,
        eventType: "VERIFICATION_SENT",
        source: SMS_CONSENT_SOURCE_PROFILE_WEB,
        ipAddress,
      });
    }

    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_SMS_OPTED_IN,
      entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
      entityId: endpoint.id,
      metadata: {
        disclosure_version: SMS_CONSENT_TEXT_VERSION,
        privacy_policy_version: versions.privacyPolicyVersion,
        terms_version: versions.termsVersion,
        verification_sent: sent.ok,
      },
      ipAddress,
    });

    revalidateSms();
    return {
      success: true,
      error: sent.ok
        ? undefined
        : sent.error ??
          "Consent was recorded. We could not send a verification text yet.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to start SMS enrollment.",
    };
  }
}

export async function verifySmsEnrollmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user } = await getAuthenticatedUserWithChurch();
    const code = String(formData.get("code") ?? "").trim();
    const challenge = await findOpenSmsEnrollmentChallenge({
      organizationId: church.id,
      userId: user.id,
    });
    if (!challenge) {
      return { error: "That code is invalid or has expired." };
    }
    const phoneE164 = challenge.phoneE164;
    const endpoint = await findSmsEndpointByDestination(
      supabase,
      church.id,
      user.id,
      phoneE164,
    );
    if (!endpoint) {
      return { error: "Add a mobile number before verifying SMS." };
    }
    if (endpoint.suppressed_at) {
      return { error: CARRIER_STOP_MESSAGE };
    }
    const verified = await verifySmsEnrollmentCode({
      organizationId: church.id,
      userId: user.id,
      phoneE164,
      code,
    });
    if (!verified.ok) {
      const message = verified.error ?? "Unable to verify that code.";
      return { error: message, fieldErrors: { code: message } };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("notification_endpoints")
      .update({
        ...verifiedEnrollmentPatch(),
        verified_at: now,
      })
      .eq("id", endpoint.id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };

    await supabase
      .from("notification_endpoints")
      .update(retirePreviousSmsPatch())
      .eq("organization_id", church.id)
      .eq("user_id", user.id)
      .eq("channel", "sms")
      .neq("id", endpoint.id)
      .neq("status", "revoked");

    await recordSmsConsentEvent({
      supabase,
      organizationId: church.id,
      userId: user.id,
      endpointId: String(endpoint.id),
      phoneE164,
      eventType: "PHONE_VERIFIED",
      source: SMS_CONSENT_SOURCE_PROFILE_WEB,
      ipAddress: await getRequestIpAddress(),
      metadata: {
        sms_phone_verified: true,
      },
    });
    await recordSmsConsentEvent({
      supabase,
      organizationId: church.id,
      userId: user.id,
      endpointId: String(endpoint.id),
      phoneE164,
      eventType: "SMS_ENABLED",
      source: SMS_CONSENT_SOURCE_PROFILE_WEB,
      metadata: {
        sms_opted_in: true,
        sms_phone_verified: true,
        sms_consent_source: SMS_CONSENT_SOURCE_PROFILE_WEB,
        sms_consent_version: SMS_CONSENT_TEXT_VERSION,
      },
    });

    await sendSmsEnrollmentConfirmation(phoneE164);
    revalidateSms();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to verify that code.",
    };
  }
}

export async function optOutSmsAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _formData;
  try {
    const { supabase, church, user } = await getAuthenticatedUserWithChurch();
    const endpoint = await findPrimarySmsEndpoint(supabase, church.id, user.id);
    if (!endpoint) {
      return { error: "SMS messaging is not enrolled." };
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("notification_endpoints")
      .update({
        consent_status: "revoked",
        consent_source: SMS_CONSENT_SOURCE_PROFILE_WEB,
        status: "disabled",
      })
      .eq("id", endpoint.id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };

    await recordSmsConsentEvent({
      supabase,
      organizationId: church.id,
      userId: user.id,
      endpointId: String(endpoint.id),
      phoneE164: String(endpoint.normalized_destination),
      eventType: "SMS_OPTED_OUT",
      source: SMS_CONSENT_SOURCE_PROFILE_WEB,
      ipAddress: await getRequestIpAddress(),
      userAgent: await getRequestUserAgent(),
      metadata: {
        sms_opted_in: false,
        sms_opt_out_timestamp: now,
        sms_consent_source: SMS_CONSENT_SOURCE_PROFILE_WEB,
      },
    });
    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_SMS_OPTED_OUT,
      entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
      entityId: String(endpoint.id),
      ipAddress: await getRequestIpAddress(),
    });
    revalidateSms();
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to opt out of SMS.",
    };
  }
}
