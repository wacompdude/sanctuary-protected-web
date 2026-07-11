import { createClient } from "@/lib/supabase/server";
import type { AppRole, Church, Profile } from "./types";
import { canManageCertifications } from "./types";

export class ChurchAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChurchAccessError";
  }
}

export async function getAuthenticatedUserWithChurch() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ChurchAccessError("You must be signed in to continue.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      `
      id,
      church_id,
      full_name,
      role,
      churches (
        id,
        name
      )
    `,
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    const detail =
      process.env.NODE_ENV === "development"
        ? ` ${profileError.message}`
        : "";
    throw new ChurchAccessError(`Unable to load your profile.${detail}`);
  }

  if (!profile) {
    throw new ChurchAccessError(
      "Your account is not linked to a church yet. Run supabase/seed.sql in the Supabase SQL Editor to link your user to a church.",
    );
  }

  const churchData = profile.churches;
  const church = Array.isArray(churchData) ? churchData[0] : churchData;

  if (!church) {
    const detail =
      process.env.NODE_ENV === "development"
        ? ` No church found for church_id ${profile.church_id}. Run supabase/migrations/004_fix_churches_access.sql.`
        : "";
    throw new ChurchAccessError(`Unable to load your church.${detail}`);
  }

  const role = (profile.role as AppRole | null) ?? "member";

  return {
    supabase,
    user,
    profile: {
      id: profile.id,
      church_id: profile.church_id,
      full_name: profile.full_name,
      role,
    } as Profile,
    church: church as Church,
    canManageCertifications: canManageCertifications(role),
  };
}
