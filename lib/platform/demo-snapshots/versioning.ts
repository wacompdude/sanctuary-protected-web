import type { DemoSnapshotRecord } from "@/lib/platform/demo-snapshots/types";

const PLAN_LABELS: Record<string, string> = {
  servant_standard: "Servant Standard",
  steward_pro: "Steward Pro",
  shepherd_plus: "Shepherd Plus",
  omni_enterprise: "Omni Enterprise",
};

const FEATURE_TABLE_HINTS: Array<{ table: string; label: string }> = [
  { table: "campuses", label: "Campuses" },
  { table: "incidents", label: "Incidents" },
  { table: "schedule_events", label: "Scheduling" },
  { table: "security_equipment", label: "Hardware" },
  { table: "medical_supplies", label: "Medical" },
  { table: "policies", label: "Policies" },
  { table: "training_events", label: "Training" },
  { table: "safety_concern_profiles", label: "Safety concerns" },
  { table: "notification_groups", label: "Notification groups" },
];

export type SnapshotFeatureSummary = {
  labels: string[];
  totalRecords: number;
  overrideCount: number;
};

export function tierBadgeLabel(planKey: string | null | undefined): string {
  if (!planKey) return "No plan";
  return PLAN_LABELS[planKey] ?? planKey.replace(/_/g, " ");
}

export function buildSnapshotFeatureSummary(
  snapshot: Pick<
    DemoSnapshotRecord,
    "record_counts" | "feature_entitlement_snapshot" | "file_count"
  >,
): SnapshotFeatureSummary {
  const labels: string[] = [];
  let totalRecords = 0;
  for (const count of Object.values(snapshot.record_counts ?? {})) {
    totalRecords += Number(count) || 0;
  }
  for (const hint of FEATURE_TABLE_HINTS) {
    const count = Number(snapshot.record_counts?.[hint.table] ?? 0);
    if (count > 0) labels.push(`${hint.label} (${count})`);
  }
  if (snapshot.file_count > 0) {
    labels.push(`Files (${snapshot.file_count})`);
  }

  const overrides = snapshot.feature_entitlement_snapshot?.overrides;
  const overrideCount = Array.isArray(overrides) ? overrides.length : 0;
  if (overrideCount > 0) {
    labels.push(`Entitlement overrides (${overrideCount})`);
  }

  return { labels, totalRecords, overrideCount };
}

export type SnapshotListFilters = {
  q?: string;
  status?: string;
  plan?: string;
  tag?: string;
  onlyDefault?: boolean;
  onlyProtected?: boolean;
  onlyAutomatic?: boolean;
  includeArchived?: boolean;
};

export function filterDemoSnapshots(
  snapshots: DemoSnapshotRecord[],
  filters: SnapshotListFilters,
): DemoSnapshotRecord[] {
  const q = filters.q?.trim().toLowerCase() ?? "";
  const tag = filters.tag?.trim().toLowerCase() ?? "";

  return snapshots.filter((snap) => {
    if (!filters.includeArchived && snap.archived_at) return false;
    if (filters.status && snap.snapshot_status !== filters.status) return false;
    if (filters.plan && snap.subscription_plan_key_snapshot !== filters.plan) {
      return false;
    }
    if (filters.onlyDefault && !snap.is_default) return false;
    if (filters.onlyProtected && !snap.is_protected) return false;
    if (filters.onlyAutomatic && !snap.is_automatic) return false;
    if (tag && !snap.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (q) {
      const hay = [
        snap.name,
        snap.slug,
        snap.version_label ?? "",
        snap.description ?? "",
        snap.subscription_plan_key_snapshot ?? "",
        ...snap.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function uniqueSnapshotTags(snapshots: DemoSnapshotRecord[]): string[] {
  const set = new Set<string>();
  for (const snap of snapshots) {
    for (const tag of snap.tags) set.add(tag);
  }
  return Array.from(set).sort();
}

export function uniqueSnapshotPlans(snapshots: DemoSnapshotRecord[]): string[] {
  const set = new Set<string>();
  for (const snap of snapshots) {
    if (snap.subscription_plan_key_snapshot) {
      set.add(snap.subscription_plan_key_snapshot);
    }
  }
  return Array.from(set).sort();
}
