import type { EmailSenderCategory } from "@/lib/email/email-sender-types";
import { isEmailSenderCategory } from "@/lib/email/email-sender-types";
import { resolveEmailSender } from "@/lib/email/resolve-email-sender";
import type { EmailSenderConfiguration } from "@/lib/email/email-sender-types";
import type { NotificationSeverity } from "@/lib/notifications/types";
import { EmailSenderConfigError } from "@/lib/email/validate-email-sender";

/**
 * Deterministic notification-type → sender category map.
 * Unknown types fall back to alerts (never emergency).
 */
export const NOTIFICATION_SENDER_CATEGORY_MAP: Record<string, EmailSenderCategory> =
  {
    // Emergency
    "emergency.alert": "emergency",
    "emergency.lockdown": "emergency",
    "emergency.evacuation": "emergency",
    "emergency.shelter_in_place": "emergency",
    "incident.critical": "emergency",
    "alarm.critical": "emergency",
    "sensor.fire_detected": "emergency",
    "sensor.smoke_detected": "emergency",
    "sensor.panic_triggered": "emergency",

    // Incidents
    "incident.created": "incidents",
    "incident.updated": "incidents",
    "incident.assigned": "incidents",
    "incident.acknowledgment_requested": "incidents",
    "incident.resolved": "incidents",
    "incident.reopened": "incidents",
    "incident.follow_up_required": "incidents",
    "incident.report_ready": "incidents",

    // Access / membership
    "membership.invited": "access",
    "membership.invitation_accepted": "access",
    "membership.accepted": "access",
    "membership.suspended": "access",
    "membership.restored": "access",
    "membership.removed": "access",
    "membership.access_removed": "access",
    "membership.role_changed": "access",
    "campus.access_granted": "access",
    "campus.access_removed": "access",
    "group.member_added": "access",
    "group.member_removed": "access",
    "account.email_changed": "access",
    "account.password_reset_requested": "access",
    "account.verification_requested": "access",
    "account.security_notice": "access",

    // Hardware / equipment
    "equipment.maintenance_due": "hardware",
    "equipment.maintenance_overdue": "hardware",
    "equipment.out_of_service": "hardware",
    "equipment.warranty_expiring": "hardware",
    "equipment.inspection_due": "hardware",
    "equipment.replacement_approaching": "hardware",
    "equipment.sensor_stopped": "hardware",
    "equipment.camera_verification_overdue": "hardware",
    "camera.offline": "hardware",
    "camera.verification_due": "hardware",
    "sensor.offline": "hardware",
    "sensor.alert": "hardware",
    "radio.inspection_due": "hardware",
    "network_device.offline": "hardware",
    "access_control.device_offline": "hardware",
    "battery.low": "hardware",

    // Billing / admin commercial
    "billing.subscription_created": "billing",
    "billing.subscription_changed": "billing",
    "billing.subscription_cancelled": "billing",
    "billing.payment_succeeded": "billing",
    "billing.payment_failed": "billing",
    "billing.invoice_available": "billing",
    "billing.trial_ending": "billing",
    "billing.account_suspended": "billing",
    "billing.refund_processed": "billing",
    "admin.trial_expiring": "billing",
    "admin.account_suspended": "billing",

    // Support
    "support.case_created": "support",
    "support.case_updated": "support",
    "support.case_resolved": "support",
    "support.response_received": "support",
    "support.follow_up_required": "support",
    "admin.delivery_failed": "support",
    "admin.config_warning": "support",

    // Informational
    "general.announcement": "info",
    "church.announcement": "info",
    "campus.announcement": "info",
    "policy.published": "info",
    "policy.updated": "info",
    "policy.acknowledgment_required": "info",
    "training.announcement": "info",
    "schedule.general_message": "info",
    "schedule.custom_message": "info",
    "schedule.event_created": "info",
    "schedule.event_updated": "info",
    "schedule.event_cancelled": "info",
    "schedule.shift_created": "info",
    "schedule.shift_updated": "info",
    "schedule.shift_cancelled": "info",
    "schedule.assignment_created": "info",
    "schedule.assignment_changed": "info",
    "schedule.assignment_cancelled": "info",
    "schedule.assignment_reminder": "info",
    "schedule.assignment_response_required": "info",
    "schedule.assignment_accepted": "info",
    "schedule.assignment_declined": "info",
    "schedule.open_shift_available": "info",
    "schedule.unfilled_shift_warning": "info",
    "schedule.conflict_override": "info",
    "certification.expiring": "info",
    "certification.expired": "info",
    "certification.renewed": "info",
    "certification.missing_required": "info",
    "admin.daily_summary": "info",
    "admin.weekly_summary": "info",

    // No-reply / system
    "notification.test": "no_reply",
    "system.generated_report": "no_reply",
    "system.export_ready": "no_reply",
    "system.job_completed": "no_reply",
    "system.email_verification_code": "no_reply",
  };

/** Types allowed to escalate to emergency when severity is critical. */
export const EMERGENCY_ELIGIBLE_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "emergency.alert",
  "emergency.lockdown",
  "emergency.evacuation",
  "emergency.shelter_in_place",
  "incident.critical",
  "incident.created",
  "alarm.critical",
  "sensor.fire_detected",
  "sensor.smoke_detected",
  "sensor.panic_triggered",
  "equipment.out_of_service",
  "sensor.alert",
]);

export function mapNotificationTypeToSenderCategory(
  notificationType: string,
): { category: EmailSenderCategory; usedFallback: boolean } {
  const key = notificationType.trim();
  const mapped = NOTIFICATION_SENDER_CATEGORY_MAP[key];
  if (mapped) {
    return { category: mapped, usedFallback: false };
  }
  return { category: "alerts", usedFallback: true };
}

export function resolveSenderForNotification(input: {
  notificationType: string;
  severity?: NotificationSeverity;
  /** Server-side only; never from client-provided free text. */
  requestedCategory?: EmailSenderCategory;
  /**
   * Optional template hint. Used only when the notification type has no
   * explicit map (would fall back to alerts). Never overrides a mapped type.
   * Never upgrades to emergency unless the type is emergency-eligible.
   */
  templateDefaultCategory?: EmailSenderCategory;
}): EmailSenderConfiguration {
  const notificationType = input.notificationType?.trim();
  if (!notificationType || notificationType.length > 120) {
    throw new EmailSenderConfigError(
      "invalid_notification_type",
      "A valid notification type is required to resolve a sender.",
    );
  }

  if (
    input.requestedCategory != null &&
    !isEmailSenderCategory(input.requestedCategory)
  ) {
    throw new EmailSenderConfigError(
      "unsupported_sender_category",
      "Unsupported email sender category.",
    );
  }

  if (
    input.templateDefaultCategory != null &&
    !isEmailSenderCategory(input.templateDefaultCategory)
  ) {
    throw new EmailSenderConfigError(
      "unsupported_sender_category",
      "Unsupported template sender category.",
    );
  }

  const mapped = mapNotificationTypeToSenderCategory(notificationType);
  let category = mapped.category;
  let usedCategoryFallback = mapped.usedFallback;

  if (input.requestedCategory) {
    // Explicit server-side override (e.g. protected sender tests).
    category = input.requestedCategory;
    usedCategoryFallback = false;
  } else if (mapped.usedFallback && input.templateDefaultCategory) {
    // Template hint fills gaps only — never replaces a mapped type.
    if (
      input.templateDefaultCategory === "emergency" &&
      !EMERGENCY_ELIGIBLE_NOTIFICATION_TYPES.has(notificationType)
    ) {
      category = "alerts";
      usedCategoryFallback = true;
    } else {
      category = input.templateDefaultCategory;
      usedCategoryFallback = false;
    }
  } else if (
    input.severity === "critical" &&
    EMERGENCY_ELIGIBLE_NOTIFICATION_TYPES.has(notificationType) &&
    category !== "emergency"
  ) {
    category = "emergency";
  }

  // Never escalate non-eligible types to emergency via severity alone.
  if (
    category === "emergency" &&
    !EMERGENCY_ELIGIBLE_NOTIFICATION_TYPES.has(notificationType) &&
    !input.requestedCategory
  ) {
    category = mapped.category === "emergency" ? "alerts" : mapped.category;
  }

  const sender = resolveEmailSender(category);
  return {
    ...sender,
    usedCategoryFallback: usedCategoryFallback && !input.requestedCategory,
  };
}
