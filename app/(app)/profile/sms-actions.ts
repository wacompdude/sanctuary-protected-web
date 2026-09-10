"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import type { ActionState } from "@/lib/organization/types";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, getRequestUserAgent } from "@/lib/audit/request-ip";
import {
  SMS_CONSENT_TEXT_VERSION,
  smsConsentPolicyVersions,
} from "@/lib/sms/consent-copy";
import {
  findPrimarySmsEndpoint,
  recordSmsConsentEvent,
  upsertSmsEndpointForPhone,
} from "@/lib/sms/consent";
import { inspectMobileNumber } from "@/lib/sms/phone";
import {
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
    const endpoint = upsert.endpoint as { id: string } | null | undefined;
    if (!endpoint?.id) {
      return { error: "Unable to save SMS enrollment." };
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
        consent_source: "USER_PROFILE",
        consent_disclosure_version: SMS_CONSENT_TEXT_VERSION,
        privacy_policy_version: versions.privacyPolicyVersion,
        terms_version: versions.termsVersion,
        destination_region: inspected.region,
        status: "unverified",
        is_verified: false,
        is_primary: true,
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
      source: "USER_PROFILE",
      ipAddress,
      userAgent,
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
        source: "USER_PROFILE",
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
    const endpoint = await findPrimarySmsEndpoint(supabase, church.id, user.id);
    if (!endpoint) {
      return { error: "Add a mobile number before verifying SMS." };
    }
    const phoneE164 = String(endpoint.normalized_destination);
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
        consent_status: "granted",
        is_verified: true,
        verified_at: now,
        status: "active",
        suppressed_at: null,
        suppression_source: null,
      })
      .eq("id", endpoint.id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };

    await recordSmsConsentEvent({
      supabase,
      organizationId: church.id,
      userId: user.id,
      endpointId: String(endpoint.id),
      phoneE164,
      eventType: "PHONE_VERIFIED",
      source: "USER_PROFILE",
      ipAddress: await getRequestIpAddress(),
    });
    await recordSmsConsentEvent({
      supabase,
      organizationId: church.id,
      userId: user.id,
      endpointId: String(endpoint.id),
      phoneE164,
      eventType: "SMS_ENABLED",
      source: "USER_PROFILE",
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
        consent_recorded_at: now,
        consent_source: "USER_PROFILE",
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
      source: "USER_PROFILE",
      ipAddress: await getRequestIpAddress(),
      userAgent: await getRequestUserAgent(),
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
