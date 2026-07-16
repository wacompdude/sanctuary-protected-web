import { createClient } from "@/lib/supabase/server";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { hasMinRole } from "@/lib/church/navigation";
import {
  INCIDENT_MEDIA_BUCKET,
  INCIDENT_SIGNED_URL_SECONDS,
} from "@/lib/incidents/attachment-storage";
import type {
  Incident,
  IncidentAttachment,
  IncidentInvolvedMember,
  IncidentUpdate,
} from "./types";
import type { TeamMemberRow } from "@/lib/church/team";
import type { IncidentListSort } from "./format";

export {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getOperationalChurchContext,
} from "@/lib/church/auth";

export async function listIncidentsForChurch(
  churchId: string,
  sort: IncidentListSort = "occurred_at_desc",
) {
  const supabase = await createClient();

  let query = supabase.from("incidents").select("*").eq("church_id", churchId);

  switch (sort) {
    case "occurred_at_asc":
      query = query.order("occurred_at", { ascending: true });
      break;
    case "severity_desc":
      // Enum order is not severity-ranked in Postgres; sort by occurred_at then refine in memory.
      query = query.order("occurred_at", { ascending: false });
      break;
    case "status":
      query = query.order("status", { ascending: true }).order("occurred_at", {
        ascending: false,
      });
      break;
    case "occurred_at_desc":
    default:
      query = query.order("occurred_at", { ascending: false });
      break;
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Incident[];
  if (sort !== "severity_desc") {
    return rows;
  }

  const severityRank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...rows].sort((a, b) => {
    const diff =
      (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
    if (diff !== 0) return diff;
    return (
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    );
  });
}

export async function getIncidentWithUpdates(incidentId: string) {
  const supabase = await createClient();

  const { data: incident, error: incidentError } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (incidentError) {
    throw new Error(incidentError.message);
  }

  if (!incident) {
    return null;
  }

  const { data: updates, error: updatesError } = await supabase
    .from("incident_updates")
    .select("*")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });

  if (updatesError) {
    throw new Error(updatesError.message);
  }

  const { data: attachmentRows, error: attachmentsError } = await supabase
    .from("incident_attachments")
    .select("*")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });

  if (attachmentsError) {
    // Migration may not be applied yet — treat as no photos instead of failing the page.
    if (
      attachmentsError.message.includes("incident_attachments") ||
      attachmentsError.code === "42P01" ||
      attachmentsError.code === "PGRST205"
    ) {
      return {
        ...(incident as Incident),
        updates: (updates ?? []) as IncidentUpdate[],
        attachments: [],
      };
    }
    throw new Error(attachmentsError.message);
  }

  const attachments = (attachmentRows ?? []) as IncidentAttachment[];
  const withUrls: IncidentAttachment[] = [];

  for (const attachment of attachments) {
    const { data: signed } = await supabase.storage
      .from(INCIDENT_MEDIA_BUCKET)
      .createSignedUrl(attachment.storage_path, INCIDENT_SIGNED_URL_SECONDS);
    withUrls.push({
      ...attachment,
      signed_url: signed?.signedUrl ?? null,
    });
  }

  return {
    ...(incident as Incident),
    updates: (updates ?? []) as IncidentUpdate[],
    attachments: withUrls,
  };
}

export async function listActiveIncidentTeamMembers(
  churchId: string,
): Promise<TeamMemberRow[]> {
  const rows = await listChurchTeamMemberships(churchId);
  return rows.filter(
    (member) =>
      member.status === "active" && hasMinRole(member.role, "security_member"),
  );
}

export async function listIncidentInvolvedMembers(
  churchId: string,
  incidentId: string,
): Promise<IncidentInvolvedMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incident_team_members")
    .select("id, incident_id, membership_id, created_at")
    .eq("church_id", churchId)
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });

  if (error) {
    if (
      error.message.includes("incident_team_members") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return [];
    }
    throw new Error(error.message);
  }

  const memberships = await listChurchTeamMemberships(churchId).catch(() => []);
  const membershipMap = new Map(
    memberships.map((membership) => [membership.membershipId, membership]),
  );

  return (data ?? []).map((row) => {
    const membership = membershipMap.get(row.membership_id as string);
    return {
      id: row.id as string,
      incident_id: row.incident_id as string,
      membership_id: row.membership_id as string,
      user_id: membership?.userId ?? null,
      name: membership?.name ?? "Former team member",
      email: membership?.email ?? null,
      role: membership?.role ?? "viewer",
      status: membership?.status ?? "removed",
      created_at: row.created_at as string,
    };
  });
}
