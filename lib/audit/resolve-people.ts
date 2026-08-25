import { displayMemberName } from "@/lib/organization/team";

export type AuditPerson = {
  userId: string;
  name: string;
  email: string | null;
  label: string;
};

export function formatAuditPersonLabel(
  name: string,
  email: string | null,
): string {
  const trimmedName = name.trim();
  const trimmedEmail = email?.trim() || null;
  if (trimmedName && trimmedEmail) {
    return `${trimmedName} (${trimmedEmail})`;
  }
  return trimmedName || trimmedEmail || "Unknown user";
}

/**
 * Resolve user IDs to name + email for audit displays.
 * Uses the service role so platform operators and removed members still resolve
 * (team roster RPCs intentionally hide those users from church UIs).
 */
export async function resolveAuditPeopleByIds(
  userIds: string[],
): Promise<Map<string, AuditPerson>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const byUserId = new Map<string, AuditPerson>();
  if (unique.length === 0) return byUserId;

  const { createAdminClient, isServiceRoleConfigured } = await import(
    "@/lib/supabase/admin"
  );

  if (!isServiceRoleConfigured()) {
    for (const userId of unique) {
      byUserId.set(userId, {
        userId,
        name: "Unknown user",
        email: null,
        label: "Unknown user",
      });
    }
    return byUserId;
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, full_name")
    .in("id", unique);

  const profileById = new Map(
    (profiles ?? []).map((row) => [row.id as string, row]),
  );

  await Promise.all(
    unique.map(async (userId) => {
      const profile = profileById.get(userId) ?? null;
      let email: string | null = null;
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (!error) {
          email = data.user?.email?.trim().toLowerCase() ?? null;
        }
      } catch {
        // Keep profile-only resolution when auth lookup fails.
      }

      const nameFromProfile = displayMemberName(profile);
      const name =
        nameFromProfile !== "Member"
          ? nameFromProfile
          : email
            ? email.split("@")[0] || "Unknown user"
            : "Unknown user";

      byUserId.set(userId, {
        userId,
        name,
        email,
        label: formatAuditPersonLabel(name, email),
      });
    }),
  );

  return byUserId;
}
