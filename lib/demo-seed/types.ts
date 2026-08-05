export type SeedCountBucket = {
  created: number;
  updated: number;
  skipped: number;
};

export type DemoSeedSummary = {
  seedSource: string;
  organizationId: string | null;
  churchName: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  counts: Record<string, SeedCountBucket>;
  roleMapping: Record<string, string>;
  testAccounts: Array<{
    name: string;
    email: string;
    role: string;
    status: string;
  }>;
  logs: string[];
  warnings: string[];
  errors: string[];
};

export type DemoSeedContext = {
  admin: import("@supabase/supabase-js").SupabaseClient;
  seedSource: string;
  tempPassword: string;
  ownerUserId: string;
  summary: DemoSeedSummary;
  organizationId: string;
  primaryCampusId: string;
  sunshineCampusId: string;
  /** seedKey → user id */
  userIds: Map<string, string>;
  /** seedKey → membership id */
  membershipIds: Map<string, string>;
  /** seedKey → entity id (generic) */
  ids: Map<string, string>;
};

export function emptyBucket(): SeedCountBucket {
  return { created: 0, updated: 0, skipped: 0 };
}

export function bump(
  summary: DemoSeedSummary,
  domain: string,
  kind: keyof SeedCountBucket,
  amount = 1,
): void {
  if (!summary.counts[domain]) summary.counts[domain] = emptyBucket();
  summary.counts[domain]![kind] += amount;
}

export function log(summary: DemoSeedSummary, message: string): void {
  summary.logs.push(message);
  console.log(`[demo-seed] ${message}`);
}

export function warn(summary: DemoSeedSummary, message: string): void {
  summary.warnings.push(message);
  console.warn(`[demo-seed] WARN ${message}`);
}
