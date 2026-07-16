import type {
  MedicalSupply,
  MedicalSupplyUsage,
  RestockReportRow,
} from "@/lib/medical-supplies/types";
import { createClient } from "@/lib/supabase/server";

export {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getOperationalChurchContext,
} from "@/lib/church/auth";

const SUPPLY_SELECT = `
  id, church_id, name, category, unit, quantity_on_hand, minimum_quantity,
  location_name, sku, vendor_name, notes, created_by, updated_by,
  created_at, updated_at, archived_at
`;

function migrationHint(error: { message?: string; code?: string }): boolean {
  return (
    Boolean(error.message?.includes("medical_supplies")) ||
    error.code === "42P01" ||
    error.code === "PGRST205"
  );
}

export async function listMedicalSupplies(
  churchId: string,
  options: { includeArchived?: boolean; lowStockOnly?: boolean } = {},
): Promise<MedicalSupply[]> {
  const supabase = await createClient();
  let query = supabase
    .from("medical_supplies")
    .select(SUPPLY_SELECT)
    .eq("church_id", churchId)
    .order("name", { ascending: true });

  if (!options.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;

  if (error) {
    if (migrationHint(error)) {
      throw new Error(
        "Run supabase/migrations/023_medical_supplies.sql in the Supabase SQL Editor.",
      );
    }
    throw new Error(error.message);
  }

  let rows = (data ?? []) as MedicalSupply[];
  if (options.lowStockOnly) {
    rows = rows.filter(
      (row) => row.quantity_on_hand <= row.minimum_quantity,
    );
  }
  return rows;
}

export async function getMedicalSupplyById(
  id: string,
  churchId: string,
): Promise<MedicalSupply | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medical_supplies")
    .select(SUPPLY_SELECT)
    .eq("id", id)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return (data as MedicalSupply | null) ?? null;
}

export async function getMedicalSupplySummary(churchId: string): Promise<{
  total: number;
  lowStock: number;
  outOfStock: number;
}> {
  const supplies = await listMedicalSupplies(churchId);
  return {
    total: supplies.length,
    lowStock: supplies.filter(
      (row) => row.quantity_on_hand <= row.minimum_quantity,
    ).length,
    outOfStock: supplies.filter((row) => row.quantity_on_hand === 0).length,
  };
}

export async function getRestockReport(
  churchId: string,
): Promise<RestockReportRow[]> {
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffIso = cutoff.toISOString();

  const [suppliesResult, usageResult] = await Promise.all([
    supabase
      .from("medical_supplies")
      .select(SUPPLY_SELECT)
      .eq("church_id", churchId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("medical_supply_usage")
      .select("medical_supply_id, quantity_used, incident_id")
      .eq("church_id", churchId)
      .gte("created_at", cutoffIso),
  ]);

  if (suppliesResult.error) {
    if (migrationHint(suppliesResult.error)) {
      throw new Error(
        "Run supabase/migrations/023_medical_supplies.sql in the Supabase SQL Editor.",
      );
    }
    throw new Error(suppliesResult.error.message);
  }
  if (usageResult.error) {
    throw new Error(usageResult.error.message);
  }

  const usageBySupply = new Map<string, number>();
  for (const row of usageResult.data ?? []) {
    const id = row.medical_supply_id as string;
    usageBySupply.set(
      id,
      (usageBySupply.get(id) ?? 0) + Number(row.quantity_used),
    );
  }

  return ((suppliesResult.data ?? []) as MedicalSupply[])
    .filter((row) => row.quantity_on_hand <= row.minimum_quantity)
    .map((row) => ({
      ...row,
      reorder_gap: row.minimum_quantity - row.quantity_on_hand,
      used_last_30d: usageBySupply.get(row.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.reorder_gap - a.reorder_gap || a.name.localeCompare(b.name),
    );
}

export async function listUsageForIncident(
  churchId: string,
  incidentId: string,
): Promise<MedicalSupplyUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medical_supply_usage")
    .select(
      `
      id, church_id, incident_id, medical_supply_id, quantity_used,
      recorded_by, notes, created_at,
      medical_supplies ( name, unit )
    `,
    )
    .eq("church_id", churchId)
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: false });

  if (error) {
    if (migrationHint(error)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const supply = Array.isArray(row.medical_supplies)
      ? row.medical_supplies[0]
      : row.medical_supplies;
    return {
      id: row.id as string,
      church_id: row.church_id as string,
      incident_id: row.incident_id as string,
      medical_supply_id: row.medical_supply_id as string,
      quantity_used: row.quantity_used as number,
      recorded_by: row.recorded_by as string | null,
      notes: row.notes as string | null,
      created_at: row.created_at as string,
      supply_name: (supply as { name?: string } | null)?.name ?? "Supply",
      supply_unit: (supply as { unit?: string } | null)?.unit ?? "each",
    };
  });
}

export async function listAvailableSuppliesForIncident(
  churchId: string,
): Promise<MedicalSupply[]> {
  const supplies = await listMedicalSupplies(churchId);
  return supplies.filter((row) => row.quantity_on_hand > 0);
}
