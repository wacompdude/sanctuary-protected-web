import { createClient } from "@/lib/supabase/server";
import { getCertificationStatus } from "./status";
import type {
  Certification,
  CertificationWithMember,
  TeamMember,
} from "./types";

export async function listTeamMembersForChurch(churchId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("church_id", churchId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TeamMember[];
}

export async function listCertificationsForChurch(churchId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("certifications")
    .select(
      `
      *,
      team_members (
        id,
        full_name,
        title,
        email
      )
    `,
    )
    .eq("church_id", churchId)
    .order("expiration_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const memberData = row.team_members;
    const team_member = Array.isArray(memberData)
      ? memberData[0]
      : memberData;

    const { team_members, ...cert } = row;
    void team_members;

    return {
      ...(cert as Certification),
      team_member: team_member ?? null,
      status: getCertificationStatus(cert.expiration_date),
    } as CertificationWithMember;
  });
}

export async function getCertificationCounts(churchId: string) {
  const certifications = await listCertificationsForChurch(churchId);

  return {
    total: certifications.length,
    active: certifications.filter((c) => c.status === "active").length,
    expiring_soon: certifications.filter((c) => c.status === "expiring_soon")
      .length,
    expired: certifications.filter((c) => c.status === "expired").length,
  };
}
