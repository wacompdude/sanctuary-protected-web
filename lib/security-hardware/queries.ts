import {
  shortCodeForCategory,
} from "@/lib/security-hardware/constants";
import {
  ALL_DETAIL_TABLES,
  detailTableForCategory,
  type CategoryDetailRecord,
} from "@/lib/security-hardware/category-details";
import type {
  CampusOption,
  EquipmentListFilters,
  EquipmentSummary,
  SecurityEquipment,
  SecurityEquipmentWithDetails,
} from "@/lib/security-hardware/types";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getOperationalChurchContext,
} from "@/lib/church/auth";

const EQUIPMENT_SELECT = `
  id, church_id, campus_id, category, subcategory, name, description,
  asset_tag, manufacturer, model, serial_number, status, criticality,
  location_name, building, floor, room, installation_area,
  assigned_user_id, assigned_team, responsible_user_id,
  purchase_date, purchase_price, vendor_name, vendor_contact,
  warranty_expiration, installed_date,
  last_inspected_at, next_inspection_at, last_maintenance_at, next_maintenance_at,
  expected_replacement_date, replacement_cost_estimate, notes,
  photo_path, manual_path, created_by, updated_by,
  created_at, updated_at, archived_at
`;

function addDaysIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function listCampusesForChurch(
  churchId: string,
): Promise<CampusOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campuses")
    .select("id, name, status")
    .eq("church_id", churchId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CampusOption[];
}

export async function getChurchEquipmentWarningDays(churchId: string): Promise<{
  warrantyDays: number;
  replacementDays: number;
  assetTagPrefix: string;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("churches")
    .select(
      "equipment_warranty_warning_days, equipment_replacement_warning_days, equipment_asset_tag_prefix",
    )
    .eq("id", churchId)
    .maybeSingle();

  return {
    warrantyDays: data?.equipment_warranty_warning_days ?? 90,
    replacementDays: data?.equipment_replacement_warning_days ?? 180,
    assetTagPrefix: data?.equipment_asset_tag_prefix ?? "SP",
  };
}

export async function getEquipmentSummary(
  churchId: string,
  options?: { campusFilterOr?: string | null },
): Promise<EquipmentSummary> {
  const supabase = await createClient();
  const warnings = await getChurchEquipmentWarningDays(churchId);
  const warrantyCutoff = addDaysIso(warnings.warrantyDays);
  const replacementCutoff = addDaysIso(warnings.replacementDays);
  const today = addDaysIso(0);

  let query = supabase
    .from("security_equipment")
    .select(
      "status, criticality, assigned_user_id, assigned_team, next_maintenance_at, warranty_expiration, expected_replacement_date, archived_at",
    )
    .eq("church_id", churchId)
    .is("archived_at", null);

  if (options?.campusFilterOr) {
    query = query.or(options.campusFilterOr);
  }

  const { data, error } = await query;

  if (error) {
    if (
      error.message.includes("security_equipment") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      throw new Error(
        "Run supabase/migrations/022_security_equipment.sql in the Supabase SQL Editor.",
      );
    }
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const summary: EquipmentSummary = {
    total: rows.length,
    active: 0,
    outOfService: 0,
    maintenanceDue: 0,
    warrantyExpiring: 0,
    replacementDue: 0,
    critical: 0,
    unassigned: 0,
  };

  for (const row of rows) {
    if (row.status === "active") summary.active += 1;
    if (row.status === "out_of_service" || row.status === "maintenance") {
      summary.outOfService += 1;
    }
    if (row.criticality === "critical" || row.criticality === "high") {
      summary.critical += 1;
    }
    if (!row.assigned_user_id && !row.assigned_team) {
      summary.unassigned += 1;
    }
    if (row.next_maintenance_at) {
      const due = String(row.next_maintenance_at).slice(0, 10);
      if (due <= today) summary.maintenanceDue += 1;
    }
    if (row.warranty_expiration) {
      const exp = String(row.warranty_expiration).slice(0, 10);
      if (exp >= today && exp <= warrantyCutoff) summary.warrantyExpiring += 1;
    }
    if (row.expected_replacement_date) {
      const rep = String(row.expected_replacement_date).slice(0, 10);
      if (rep <= replacementCutoff) summary.replacementDue += 1;
    }
  }

  return summary;
}

export async function listSecurityEquipment(
  churchId: string,
  filters: EquipmentListFilters = {},
): Promise<SecurityEquipment[]> {
  const supabase = await createClient();
  const warnings = await getChurchEquipmentWarningDays(churchId);
  const warrantyCutoff = addDaysIso(warnings.warrantyDays);
  const replacementCutoff = addDaysIso(warnings.replacementDays);
  const today = addDaysIso(0);

  let query = supabase
    .from("security_equipment")
    .select(EQUIPMENT_SELECT)
    .eq("church_id", churchId)
    .order("updated_at", { ascending: false });

  if (!filters.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.campusFilterOr) {
    query = query.or(filters.campusFilterOr);
  } else if (filters.campusId) {
    query = query.or(
      `campus_id.eq.${filters.campusId},campus_id.is.null`,
    );
  }
  if (filters.criticality) {
    query = query.eq("criticality", filters.criticality);
  }
  if (filters.criticalOnly) {
    query = query.in("criticality", ["critical", "high"]);
  }
  if (filters.unassigned) {
    query = query.is("assigned_user_id", null).is("assigned_team", null);
  }
  if (filters.maintenanceDue) {
    query = query.lte("next_maintenance_at", `${today}T23:59:59.999Z`);
  }
  if (filters.warrantyExpiring) {
    query = query
      .gte("warranty_expiration", today)
      .lte("warranty_expiration", warrantyCutoff);
  }
  if (filters.replacementDue) {
    query = query.lte("expected_replacement_date", replacementCutoff);
  }

  const { data, error } = await query;

  if (error) {
    if (
      error.message.includes("security_equipment") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      throw new Error(
        "Run supabase/migrations/022_security_equipment.sql in the Supabase SQL Editor.",
      );
    }
    throw new Error(error.message);
  }

  let rows = (data ?? []) as SecurityEquipment[];

  if (filters.q?.trim()) {
    const needle = filters.q.trim().toLowerCase();
    rows = rows.filter((row) => {
      const haystack = [
        row.name,
        row.asset_tag,
        row.manufacturer,
        row.model,
        row.serial_number,
        row.location_name,
        row.vendor_name,
        row.building,
        row.room,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  const campusIds = [
    ...new Set(rows.map((row) => row.campus_id).filter(Boolean)),
  ] as string[];

  if (campusIds.length > 0) {
    const { data: campuses } = await supabase
      .from("campuses")
      .select("id, name")
      .in("id", campusIds);
    const nameById = new Map(
      (campuses ?? []).map((campus) => [campus.id as string, campus.name as string]),
    );
    rows = rows.map((row) => ({
      ...row,
      campus_name: row.campus_id ? (nameById.get(row.campus_id) ?? null) : null,
    }));
  }

  return rows;
}

export async function getSecurityEquipmentById(
  equipmentId: string,
  churchId: string,
): Promise<SecurityEquipment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("security_equipment")
    .select(EQUIPMENT_SELECT)
    .eq("id", equipmentId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as SecurityEquipment;
  if (row.campus_id) {
    const { data: campus } = await supabase
      .from("campuses")
      .select("name")
      .eq("id", row.campus_id)
      .eq("church_id", churchId)
      .maybeSingle();
    row.campus_name = campus?.name ?? null;
  }
  return row;
}

export async function loadCategoryDetails(
  supabase: SupabaseClient,
  equipment: SecurityEquipment,
): Promise<SecurityEquipmentWithDetails["categoryDetails"]> {
  const table = detailTableForCategory(equipment.category);
  if (!table) return null;

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("equipment_id", equipment.id)
    .eq("church_id", equipment.church_id)
    .maybeSingle();

  if (error || !data) return null;

  const values: CategoryDetailRecord = { ...(data as CategoryDetailRecord) };
  delete values.equipment_id;
  delete values.church_id;

  return { table, values };
}

export async function getSecurityEquipmentWithDetails(
  equipmentId: string,
  churchId: string,
): Promise<SecurityEquipmentWithDetails | null> {
  const supabase = await createClient();
  const equipment = await getSecurityEquipmentById(equipmentId, churchId);
  if (!equipment) return null;

  const categoryDetails = await loadCategoryDetails(supabase, equipment);
  return { ...equipment, categoryDetails };
}

export async function upsertCategoryDetails(params: {
  supabase: SupabaseClient;
  churchId: string;
  equipmentId: string;
  category: SecurityEquipment["category"];
  values: CategoryDetailRecord;
}): Promise<string | null> {
  const table = detailTableForCategory(params.category);
  if (!table) return null;

  // Remove other category detail rows when category changes.
  for (const other of ALL_DETAIL_TABLES) {
    if (other === table) continue;
    await params.supabase
      .from(other)
      .delete()
      .eq("equipment_id", params.equipmentId)
      .eq("church_id", params.churchId);
  }

  const payload = {
    equipment_id: params.equipmentId,
    church_id: params.churchId,
    ...params.values,
  };

  const { error } = await params.supabase.from(table).upsert(payload, {
    onConflict: "equipment_id",
  });

  if (error) {
    return error.message;
  }
  return null;
}

export async function clearAllCategoryDetails(params: {
  supabase: SupabaseClient;
  churchId: string;
  equipmentId: string;
}): Promise<void> {
  for (const table of ALL_DETAIL_TABLES) {
    await params.supabase
      .from(table)
      .delete()
      .eq("equipment_id", params.equipmentId)
      .eq("church_id", params.churchId);
  }
}

export async function suggestAssetTag(params: {
  churchId: string;
  campusId: string | null;
  category: SecurityEquipment["category"];
  prefix?: string;
}): Promise<string> {
  const supabase = await createClient();
  const prefix = (params.prefix ?? "SP").trim().toUpperCase() || "SP";
  let campusCode = "MAIN";

  if (params.campusId) {
    const { data: campus } = await supabase
      .from("campuses")
      .select("name")
      .eq("id", params.campusId)
      .eq("church_id", params.churchId)
      .maybeSingle();
    const name = (campus?.name ?? "MAIN").toUpperCase().replace(/[^A-Z0-9]+/g, "");
    campusCode = (name.slice(0, 6) || "MAIN").slice(0, 6);
  }

  const categoryCode = shortCodeForCategory(params.category);
  const stub = `${prefix}-${campusCode}-${categoryCode}-`;

  const { data } = await supabase
    .from("security_equipment")
    .select("asset_tag")
    .eq("church_id", params.churchId)
    .ilike("asset_tag", `${stub}%`);

  let max = 0;
  for (const row of data ?? []) {
    const tag = String(row.asset_tag ?? "");
    const match = tag.match(/-(\d+)$/);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `${stub}${String(max + 1).padStart(4, "0")}`;
}
