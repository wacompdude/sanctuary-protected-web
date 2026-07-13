import { createClient } from "@/lib/supabase/server";
import type { UserProfile } from "./types";

export async function getOwnProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, first_name, last_name, phone, avatar_url, full_name, created_at, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserProfile | null;
}
