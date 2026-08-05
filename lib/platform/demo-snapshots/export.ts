import type { SupabaseClient } from "@supabase/supabase-js";
import {
  exportPayloadOrder,
  tablesForStrategy,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import { storageRefsForTable } from "@/lib/platform/demo-snapshots/storage-refs";

const PAGE_SIZE = 1000;

export type ExportedTableData = {
  tables: Record<string, Record<string, unknown>[]>;
  recordCounts: Record<string, number>;
  includedTables: string[];
  excludedTables: string[];
  warnings: string[];
  /** bucket → set of object paths */
  fileCandidates: Map<string, Set<string>>;
};

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|Could not find the table|relation/i.test(
    message,
  );
}

async function fetchAllRows(
  admin: SupabaseClient,
  tableName: string,
  organizationId: string,
): Promise<{ rows: Record<string, unknown>[]; warning?: string }> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let query = admin.from(tableName).select("*").range(from, from + PAGE_SIZE - 1);

    if (tableName === "organizations") {
      query = query.eq("id", organizationId);
    } else {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          rows: [],
          warning: `Skipped missing table ${tableName}: ${error.message}`,
        };
      }
      // Some tables may lack organization_id (mis-registered) — surface as warning.
      if (/column .* does not exist|organization_id/i.test(error.message)) {
        return {
          rows: [],
          warning: `Skipped ${tableName}: ${error.message}`,
        };
      }
      throw new Error(`Export failed for ${tableName}: ${error.message}`);
    }

    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows };
}

function collectPathsFromRows(
  tableName: string,
  rows: Record<string, unknown>[],
  fileCandidates: Map<string, Set<string>>,
) {
  for (const ref of storageRefsForTable(tableName)) {
    let set = fileCandidates.get(ref.bucket);
    if (!set) {
      set = new Set();
      fileCandidates.set(ref.bucket, set);
    }
    for (const row of rows) {
      const raw = row[ref.column];
      if (typeof raw !== "string") continue;
      const path = raw.trim();
      if (!path || path.includes("://")) continue; // skip absolute URLs
      set.add(path.replace(/^\/+/, ""));
    }
  }
}

export async function exportOrganizationTables(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ExportedTableData> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const recordCounts: Record<string, number> = {};
  const includedTables: string[] = [];
  const warnings: string[] = [];
  const fileCandidates = new Map<string, Set<string>>();

  for (const def of exportPayloadOrder()) {
    const { rows, warning } = await fetchAllRows(
      admin,
      def.tableName,
      organizationId,
    );
    if (warning) {
      warnings.push(warning);
      if (def.required) {
        throw new Error(warning);
      }
      continue;
    }
    tables[def.tableName] = rows;
    recordCounts[def.tableName] = rows.length;
    includedTables.push(def.tableName);
    collectPathsFromRows(def.tableName, rows, fileCandidates);
  }

  const excludedTables = tablesForStrategy("exclude").map((t) => t.tableName);

  return {
    tables,
    recordCounts,
    includedTables,
    excludedTables,
    warnings,
    fileCandidates,
  };
}
