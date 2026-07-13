import { createClient } from "@/lib/supabase/server";
import { getUserMemberships } from "@/lib/church/auth";
import type { ChurchMembershipWithChurch } from "@/lib/church/types";
import { getCertificationStatus } from "@/lib/certifications/status";
import type { CertificationWithMember } from "@/lib/certifications/types";

export type ProfileChurchMembership = ChurchMembershipWithChurch;

export type ProfileCertification = CertificationWithMember & {
  church_name: string | null;
};

/** Churches where the current user has an active membership. */
export async function listOwnChurchMemberships(): Promise<
  ProfileChurchMembership[]
> {
  return getUserMemberships();
}

/**
 * Certifications linked to team_member rows whose email matches the
 * signed-in user (case-insensitive), across churches they can access.
 */
export async function listOwnCertifications(): Promise<ProfileCertification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return [];

  const email = user.email.trim().toLowerCase();
  const memberships = await getUserMemberships(user.id);
  const churchIds = memberships.map((m) => m.church_id);
  if (churchIds.length === 0) return [];

  const churchNameById = new Map(
    memberships.map((m) => [m.church_id, m.church.name]),
  );

  const { data: members, error: memberError } = await supabase
    .from("team_members")
    .select("id, church_id, full_name, title, email")
    .in("church_id", churchIds)
    .ilike("email", email);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const memberIds = (members ?? []).map((m) => m.id as string);
  if (memberIds.length === 0) return [];

  const memberById = new Map(
    (members ?? []).map((m) => [
      m.id as string,
      {
        id: m.id as string,
        full_name: m.full_name as string,
        title: (m.title as string | null) ?? null,
        email: (m.email as string | null) ?? null,
        church_id: m.church_id as string,
      },
    ]),
  );

  const { data: certs, error: certError } = await supabase
    .from("certifications")
    .select("*")
    .in("team_member_id", memberIds)
    .order("expiration_date", { ascending: true });

  if (certError) {
    throw new Error(certError.message);
  }

  return (certs ?? []).map((cert) => {
    const member = memberById.get(cert.team_member_id as string) ?? null;
    return {
      ...(cert as Omit<ProfileCertification, "team_member" | "status" | "church_name">),
      team_member: member
        ? {
            id: member.id,
            full_name: member.full_name,
            title: member.title,
            email: member.email,
          }
        : null,
      status: getCertificationStatus(cert.expiration_date as string),
      church_name: member
        ? (churchNameById.get(member.church_id) ?? null)
        : null,
    } as ProfileCertification;
  });
}
