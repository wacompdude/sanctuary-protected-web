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

/**
 * Find an existing certification contact for a church member, or create one.
 * Matches by email first (case-insensitive), then by exact full name.
 */
export async function ensureTeamMemberForChurchMember(params: {
  churchId: string;
  createdBy: string;
  fullName: string;
  email: string | null;
  title?: string | null;
}): Promise<TeamMember> {
  const supabase = await createClient();
  const fullName = params.fullName.trim();
  const email = params.email?.trim().toLowerCase() || null;
  const title = params.title?.trim() || null;

  if (!fullName) {
    throw new Error("Member name is required to add a certification.");
  }

  if (email) {
    const { data: byEmail, error: emailError } = await supabase
      .from("team_members")
      .select("*")
      .eq("church_id", params.churchId)
      .eq("is_active", true)
      .ilike("email", email)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (emailError) {
      throw new Error(emailError.message);
    }
    if (byEmail) {
      return byEmail as TeamMember;
    }
  }

  const { data: byName, error: nameError } = await supabase
    .from("team_members")
    .select("*")
    .eq("church_id", params.churchId)
    .eq("is_active", true)
    .eq("full_name", fullName)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nameError) {
    throw new Error(nameError.message);
  }
  if (byName) {
    return byName as TeamMember;
  }

  const { data: created, error: createError } = await supabase
    .from("team_members")
    .insert({
      church_id: params.churchId,
      full_name: fullName.slice(0, 200),
      email,
      title: title ? title.slice(0, 200) : null,
      created_by: params.createdBy,
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(createError?.message || "Unable to create certification contact.");
  }

  return created as TeamMember;
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
