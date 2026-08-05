import { listChurchTeamMemberships } from "@/lib/organization/team-queries";
import type { MembershipRole } from "@/lib/organization/types";
import { isRequiredTrainingAudienceRole } from "@/lib/training/compliance-shared";

export {
  collectRequiredCourseIds,
  countMembersMissingRequiredTraining,
  isRequiredTrainingAudienceRole,
} from "@/lib/training/compliance-shared";

export async function loadRequiredTrainingAudience(
  organizationId: string,
): Promise<Array<{ userId: string; name: string; role: MembershipRole }>> {
  const team = await listChurchTeamMemberships(organizationId).catch(() => []);
  return team
    .filter(
      (row) =>
        row.status === "active" && isRequiredTrainingAudienceRole(row.role),
    )
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      role: row.role,
    }));
}
