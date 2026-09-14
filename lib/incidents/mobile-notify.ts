import { createNotification } from "@/lib/notifications/create-notification";
import { mapIncidentSeverityToNotification } from "@/lib/notifications/constants";
import { getMobileAuthContext } from "@/lib/mfa/mobile-api";
import { canCreateOperationalNotifications } from "@/lib/notifications/permissions";
import {
  isUsableOrganizationStatus,
  normalizeMembershipRole,
} from "@/lib/organization/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { mobileNotificationCorsHeaders } from "@/lib/notifications/mobile-api";

export { mobileNotificationCorsHeaders };

export type MobileIncidentNotifyInput = {
  organizationId?: string | null;
  incidentId?: string | null;
};

export type MobileIncidentNotifyResponse =
  | { status: "unauthenticated"; error: string }
  | { status: "forbidden"; error: string }
  | { status: "error"; error: string }
  | {
      status: "ok";
      notificationId: string | null;
      skipped?: boolean;
    };

export async function notifyMobileIncident(
  request: Request,
  input: MobileIncidentNotifyInput,
): Promise<{ body: MobileIncidentNotifyResponse; status: number }> {
  const ctx = await getMobileAuthContext(request);
  if (!ctx) {
    return {
      status: 401,
      body: {
        status: "unauthenticated",
        error: "Sign in with your email and password first.",
      },
    };
  }

  const organizationId = input.organizationId?.trim() || null;
  const incidentId = input.incidentId?.trim() || null;
  if (!organizationId || !incidentId) {
    return {
      status: 400,
      body: { status: "error", error: "Incident and organization are required." },
    };
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return {
      status: 403,
      body: { status: "forbidden", error: "You do not have access to this organization." },
    };
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("status")
    .eq("id", organizationId)
    .maybeSingle();

  if (!isUsableOrganizationStatus(organization?.status)) {
    return {
      status: 403,
      body: { status: "forbidden", error: "This organization is not active." },
    };
  }

  const { data: incident, error: incidentError } = await admin
    .from("incidents")
    .select(
      "id, organization_id, created_by, title, severity, location, occurred_at, campus_id",
    )
    .eq("id", incidentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (incidentError || !incident) {
    return {
      status: 404,
      body: { status: "error", error: "Incident not found." },
    };
  }

  const role = normalizeMembershipRole(String(membership.role));
  const createdIncident = incident.created_by === ctx.userId;
  if (!createdIncident && !canCreateOperationalNotifications(role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You cannot send a notification for this incident.",
      },
    };
  }

  const severity = String(incident.severity ?? "").trim().toLowerCase();
  if (severity !== "high" && severity !== "critical") {
    return {
      status: 200,
      body: { status: "ok", notificationId: null, skipped: true },
    };
  }

  const notificationType =
    severity === "critical" ? "incident.critical" : "incident.created";

  try {
    const result = await createNotification(
      {
        organizationId,
        createdBy: ctx.userId,
        notificationType,
        severity: mapIncidentSeverityToNotification(severity),
        entityType: "incident",
        entityId: incident.id,
        actionUrl: `/incidents/${incident.id}`,
        campusId: (incident.campus_id as string | null) ?? null,
        deduplicationKey: `${notificationType}:${incident.id}`,
        templateVariables: {
          incident_title: String(incident.title ?? "Incident"),
          incident_severity: severity,
          incident_location: String(incident.location ?? ""),
          incident_time: String(incident.occurred_at ?? ""),
        },
      },
      { dispatchNow: true },
    );

    if (!result.notificationId) {
      if (result.status === "duplicate") {
        return {
          status: 200,
          body: { status: "ok", notificationId: null, skipped: true },
        };
      }
      return {
        status: 400,
        body: {
          status: "error",
          error: result.error ?? "Unable to send incident notification.",
        },
      };
    }

    await writeAuditLog(admin, {
      organizationId,
      userId: ctx.userId,
      action: AuditAction.NOTIFICATION_CREATED,
      entityType: AuditEntityType.NOTIFICATION,
      entityId: result.notificationId,
      metadata: {
        via: "mobile_incident",
        incident_id: incident.id,
        severity,
      },
    });

    return {
      status: 200,
      body: { status: "ok", notificationId: result.notificationId },
    };
  } catch (error) {
    console.error("mobile incident notify failed:", error);
    return {
      status: 500,
      body: {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to send incident notification.",
      },
    };
  }
}
