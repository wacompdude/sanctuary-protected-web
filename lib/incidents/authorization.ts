/**
 * Stage 3H-1 — Incident authorization matrix (app layer).
 * Mirrors SQL helpers in 119_incident_media_least_privilege.sql.
 *
 * Decision (operator-aligned with Stage 3G):
 * - SELECT (view) remains available to any active organization member,
 *   including viewers (no silent narrowing of legitimate viewing).
 * - Mutating actions use membership role + org policy flags (same rules as
 *   historical server actions). Permission-engine keys remain available for
 *   future group grants; this stage does not AND-require them (would deny
 *   legitimate role holders without explicit grant rows).
 */
import type { MembershipRole } from "@/lib/organization/types";
import { hasMinRole } from "@/lib/organization/navigation";

export type IncidentOrgPolicyFlags = {
  allowSecurityMembersCreate: boolean;
  allowSecurityMembersClose: boolean;
};

export type IncidentAuthContext = {
  role: MembershipRole;
  policy: IncidentOrgPolicyFlags;
};

export function canViewIncidents(_ctx: IncidentAuthContext): boolean {
  return true;
}

export function canCreateIncident(ctx: IncidentAuthContext): boolean {
  if (ctx.role === "viewer") return false;
  if (ctx.role === "security_member" && !ctx.policy.allowSecurityMembersCreate) {
    return false;
  }
  return true;
}

/** Non-viewer active members may update incident fields (status close gated separately). */
export function canUpdateIncident(ctx: IncidentAuthContext): boolean {
  return ctx.role !== "viewer";
}

export function canChangeIncidentStatus(
  ctx: IncidentAuthContext,
  nextStatus: string | null | undefined,
  previousStatus: string,
): boolean {
  if (!canUpdateIncident(ctx)) return false;
  if (nextStatus == null || nextStatus === previousStatus) return true;
  const isClosing = nextStatus === "closed" || nextStatus === "resolved";
  if (
    isClosing &&
    ctx.role === "security_member" &&
    !ctx.policy.allowSecurityMembersClose
  ) {
    return false;
  }
  return true;
}

/** Matches attachment/storage delete: uploader or security_leader+ (rank). */
export function canDeleteIncidentMedia(params: {
  role: MembershipRole;
  uploadedBy: string | null | undefined;
  actorUserId: string;
}): boolean {
  if (params.uploadedBy && params.uploadedBy === params.actorUserId) {
    return true;
  }
  return hasMinRole(params.role, "security_leader");
}

export function incidentCreateDeniedMessage(ctx: IncidentAuthContext): string {
  if (ctx.role === "viewer") return "Viewers cannot create incidents.";
  if (ctx.role === "security_member" && !ctx.policy.allowSecurityMembersCreate) {
    return "Security members are not allowed to create incidents for this church.";
  }
  return "You do not have permission to create incidents.";
}

export function incidentCloseDeniedMessage(): string {
  return "Security members are not allowed to close or resolve incidents for this church.";
}
