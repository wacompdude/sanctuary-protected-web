import type { SupabaseClient } from "@supabase/supabase-js";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import type { DashboardBoxKey } from "@/lib/dashboard/types";

export async function auditDashboardBoxSettingsUpdated(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    boxCount: number;
    visibleCount: number;
    customizedCount: number;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.DASHBOARD_BOX_SETTINGS_UPDATED,
    entityType: AuditEntityType.DASHBOARD_BOX_SETTINGS,
    entityId: params.churchId,
    metadata: {
      box_count: params.boxCount,
      visible_count: params.visibleCount,
      customized_count: params.customizedCount,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditDashboardBoxSettingReset(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    boxKey: DashboardBoxKey;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.DASHBOARD_BOX_SETTING_RESET,
    entityType: AuditEntityType.DASHBOARD_BOX_SETTINGS,
    entityId: params.churchId,
    metadata: { box_key: params.boxKey },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditDashboardBoxSettingsResetAll(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.DASHBOARD_BOX_SETTINGS_RESET_ALL,
    entityType: AuditEntityType.DASHBOARD_BOX_SETTINGS,
    entityId: params.churchId,
    metadata: { scope: "all_boxes" },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditDashboardObsoleteKeysPurged(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    obsoleteKeys: string[];
  },
) {
  if (params.obsoleteKeys.length === 0) return { ok: true as const };
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.DASHBOARD_BOX_SETTINGS_UPDATED,
    entityType: AuditEntityType.DASHBOARD_BOX_SETTINGS,
    entityId: params.churchId,
    metadata: {
      purged_obsolete_keys: params.obsoleteKeys.slice(0, 40),
      purged_count: params.obsoleteKeys.length,
    },
    ipAddress: await getRequestIpAddress(),
  });
}
