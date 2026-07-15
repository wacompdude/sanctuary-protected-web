import { createClient } from "@/lib/supabase/server";
import {
  migrationHintFromContactsError,
  type ChurchContactRecord,
  type ChurchContactType,
} from "@/lib/church/contacts";

export async function listChurchContactsForTypes(
  churchId: string,
  types: ChurchContactType[],
): Promise<{ contacts: ChurchContactRecord[]; error?: string }> {
  if (types.length === 0) return { contacts: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("church_contacts")
    .select(
      "id, church_id, contact_type, organization_name, full_name, phone, email, notes, sort_order, created_at, updated_at",
    )
    .eq("church_id", churchId)
    .in("contact_type", types)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return {
      contacts: [],
      error:
        migrationHintFromContactsError(error.message) ??
        "Unable to load contacts.",
    };
  }

  return { contacts: (data ?? []) as ChurchContactRecord[] };
}
