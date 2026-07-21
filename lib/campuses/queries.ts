import { createClient } from "@/lib/supabase/server";
import {
  CAMPUS_MIGRATION_HINT,
  campusMigrationHintFromError,
} from "@/lib/campuses/constants";
import type {
  Campus,
  CampusListResult,
  CampusStatus,
  CampusType,
} from "@/lib/campuses/types";

const EXTENDED_SELECT = `
  id, church_id, name, short_name, slug, description, campus_type, status,
  is_primary, primary_email, phone, address_line_1, address_line_2, city, state,
  postal_code, country, timezone, emergency_contact_name, emergency_contact_phone,
  police_non_emergency_phone, fire_non_emergency_phone, nearest_hospital_name,
  nearest_hospital_phone, nearest_hospital_address, logo_path,
  primary_brand_color, secondary_brand_color, created_by, updated_by,
  created_at, updated_at, archived_at
`;

const LEGACY_SELECT = `
  id, church_id, name, address_line_1, address_line_2, city, state,
  postal_code, timezone, status, created_at, updated_at
`;

function mapCampus(row: Record<string, unknown>, extended: boolean): Campus {
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    name: String(row.name ?? ""),
    short_name: extended ? ((row.short_name as string | null) ?? null) : null,
    slug: extended ? ((row.slug as string | null) ?? null) : null,
    description: extended ? ((row.description as string | null) ?? null) : null,
    campus_type: extended
      ? ((row.campus_type as CampusType) ?? "other")
      : "other",
    status: (row.status as CampusStatus) ?? "active",
    is_primary: extended ? Boolean(row.is_primary) : false,
    primary_email: extended
      ? ((row.primary_email as string | null) ?? null)
      : null,
    phone: extended ? ((row.phone as string | null) ?? null) : null,
    address_line_1: (row.address_line_1 as string | null) ?? null,
    address_line_2: (row.address_line_2 as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    postal_code: (row.postal_code as string | null) ?? null,
    country: extended ? ((row.country as string | null) ?? "US") : "US",
    timezone: (row.timezone as string | null) ?? null,
    emergency_contact_name: extended
      ? ((row.emergency_contact_name as string | null) ?? null)
      : null,
    emergency_contact_phone: extended
      ? ((row.emergency_contact_phone as string | null) ?? null)
      : null,
    police_non_emergency_phone: extended
      ? ((row.police_non_emergency_phone as string | null) ?? null)
      : null,
    fire_non_emergency_phone: extended
      ? ((row.fire_non_emergency_phone as string | null) ?? null)
      : null,
    nearest_hospital_name: extended
      ? ((row.nearest_hospital_name as string | null) ?? null)
      : null,
    nearest_hospital_phone: extended
      ? ((row.nearest_hospital_phone as string | null) ?? null)
      : null,
    nearest_hospital_address: extended
      ? ((row.nearest_hospital_address as string | null) ?? null)
      : null,
    logo_path: extended ? ((row.logo_path as string | null) ?? null) : null,
    primary_brand_color: extended
      ? ((row.primary_brand_color as string | null) ?? null)
      : null,
    secondary_brand_color: extended
      ? ((row.secondary_brand_color as string | null) ?? null)
      : null,
    created_by: extended ? ((row.created_by as string | null) ?? null) : null,
    updated_by: extended ? ((row.updated_by as string | null) ?? null) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    archived_at: extended ? ((row.archived_at as string | null) ?? null) : null,
  };
}

function formatAddress(campus: Campus): string {
  return [campus.address_line_1, campus.city, campus.state, campus.postal_code]
    .filter(Boolean)
    .join(", ");
}

export { formatAddress };

export async function listCampuses(
  churchId: string,
  options?: { includeArchived?: boolean },
): Promise<CampusListResult> {
  try {
    const supabase = await createClient();
    let extended = true;
    let data: Record<string, unknown>[] | null = null;
    let error: { message: string } | null = null;

    const extendedResult = await supabase
      .from("campuses")
      .select(EXTENDED_SELECT)
      .eq("church_id", churchId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });

    data = (extendedResult.data as Record<string, unknown>[] | null) ?? null;
    error = extendedResult.error;

    if (error && /campus_type|is_primary|short_name|slug/i.test(error.message)) {
      extended = false;
      const legacy = await supabase
        .from("campuses")
        .select(LEGACY_SELECT)
        .eq("church_id", churchId)
        .order("name", { ascending: true });
      data = (legacy.data as Record<string, unknown>[] | null) ?? null;
      error = legacy.error;
    }

    if (error) {
      if (campusMigrationHintFromError(error.message)) {
        return {
          items: [],
          tablesAvailable: false,
          extendedSchema: false,
          hint: CAMPUS_MIGRATION_HINT,
        };
      }
      throw new Error(error.message);
    }

    let items = (data ?? []).map((row) => mapCampus(row, extended));

    if (!options?.includeArchived) {
      items = items.filter(
        (item) => item.status !== "archived" && !item.archived_at,
      );
    }

    // Member counts when membership table exists
    if (extended && items.length > 0) {
      const { data: memberships } = await supabase
        .from("campus_memberships")
        .select("campus_id")
        .eq("church_id", churchId)
        .eq("status", "active");
      const counts = new Map<string, number>();
      for (const row of memberships ?? []) {
        const id = row.campus_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      items = items.map((item) => ({
        ...item,
        member_count: counts.get(item.id) ?? 0,
      }));
    }

    return {
      items,
      tablesAvailable: true,
      extendedSchema: extended,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (campusMigrationHintFromError(message)) {
      return {
        items: [],
        tablesAvailable: false,
        extendedSchema: false,
        hint: CAMPUS_MIGRATION_HINT,
      };
    }
    throw error;
  }
}

export async function getCampus(
  churchId: string,
  campusId: string,
): Promise<{ campus: Campus | null; extendedSchema: boolean }> {
  const supabase = await createClient();
  let extended = true;
  let data: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  const extendedResult = await supabase
    .from("campuses")
    .select(EXTENDED_SELECT)
    .eq("church_id", churchId)
    .eq("id", campusId)
    .maybeSingle();

  data = (extendedResult.data as Record<string, unknown> | null) ?? null;
  error = extendedResult.error;

  if (error && /campus_type|is_primary|short_name|slug/i.test(error.message)) {
    extended = false;
    const legacy = await supabase
      .from("campuses")
      .select(LEGACY_SELECT)
      .eq("church_id", churchId)
      .eq("id", campusId)
      .maybeSingle();
    data = (legacy.data as Record<string, unknown> | null) ?? null;
    error = legacy.error;
  }

  if (error) {
    if (campusMigrationHintFromError(error.message)) {
      return { campus: null, extendedSchema: false };
    }
    throw new Error(error.message);
  }
  if (!data) return { campus: null, extendedSchema: extended };

  const campus = mapCampus(data, extended);
  if (extended) {
    const { count } = await supabase
      .from("campus_memberships")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("campus_id", campusId)
      .eq("status", "active");
    campus.member_count = count ?? 0;
  }

  return {
    campus,
    extendedSchema: extended,
  };
}
