import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_KEYS, type PlanKey } from "@/lib/subscriptions/plan-keys";

export type ChurchUsageSignals = {
  activeCampusCount: number;
  hasPolicyDocuments: boolean;
  hasMedicalSupplies: boolean;
  hasHardwareInventory: boolean;
  hasIncidentPhotos: boolean;
};

/**
 * Recommend a plan from existing church data.
 * Never returns Omni (enterprise is manual). Never used to auto-downgrade.
 *
 * Rules:
 * - multi-campus or policies → Shepherd Plus
 * - medical, hardware, or incident photos → Steward Pro
 * - otherwise → Servant Standard
 */
export function recommendPlanFromSignals(
  signals: ChurchUsageSignals,
): PlanKey {
  if (signals.activeCampusCount > 1 || signals.hasPolicyDocuments) {
    return PLAN_KEYS.SHEPHERD_PLUS;
  }
  if (
    signals.hasMedicalSupplies ||
    signals.hasHardwareInventory ||
    signals.hasIncidentPhotos
  ) {
    return PLAN_KEYS.STEWARD_PRO;
  }
  return PLAN_KEYS.SERVANT_STANDARD;
}

async function countExact(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, string>,
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { count, error } = await query;
  if (error) {
    if (
      /does not exist|schema cache|Could not find the table|PGRST/i.test(
        error.message,
      )
    ) {
      return 0;
    }
    throw new Error(`Unable to inspect ${table} for plan recommendation.`);
  }
  return count ?? 0;
}

export async function collectChurchUsageSignals(
  supabase: SupabaseClient,
  churchId: string,
): Promise<ChurchUsageSignals> {
  const [
    activeCampusCount,
    policyCount,
    medicalCount,
    hardwareCount,
    photoCount,
  ] = await Promise.all([
    countExact(supabase, "campuses", {
      church_id: churchId,
      status: "active",
    }),
    countExact(supabase, "policy_documents", { church_id: churchId }),
    countExact(supabase, "medical_supplies", { church_id: churchId }),
    countExact(supabase, "security_equipment", { church_id: churchId }),
    countExact(supabase, "incident_attachments", { church_id: churchId }),
  ]);

  return {
    activeCampusCount,
    hasPolicyDocuments: policyCount > 0,
    hasMedicalSupplies: medicalCount > 0,
    hasHardwareInventory: hardwareCount > 0,
    hasIncidentPhotos: photoCount > 0,
  };
}

export async function recommendPlanForChurch(
  supabase: SupabaseClient,
  churchId: string,
): Promise<{ planKey: PlanKey; signals: ChurchUsageSignals }> {
  const signals = await collectChurchUsageSignals(supabase, churchId);
  return {
    planKey: recommendPlanFromSignals(signals),
    signals,
  };
}
