import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEMO_CHURCH_NAME,
  DEMO_EXTRA_MEMBERS,
  DEMO_NAMED_USERS,
  DEMO_OWNER_PLATFORM_EMAIL,
  DEMO_SEED_SOURCE,
} from "@/lib/demo-seed/constants";
import { validateDemoSeedCleanupEnv } from "@/lib/demo-seed/env";
import { DEMO_CLEANUP_TABLE_ORDER } from "@/lib/demo-seed/registry";

export type DemoCleanupSummary = {
  seedSource: string;
  organizationId: string | null;
  churchName: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  deleted: Record<string, number>;
  skipped: string[];
  logs: string[];
  warnings: string[];
  errors: string[];
};

function emptyCleanupSummary(): DemoCleanupSummary {
  return {
    seedSource: DEMO_SEED_SOURCE,
    organizationId: null,
    churchName: DEMO_CHURCH_NAME,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: false,
    deleted: {},
    skipped: [],
    logs: [],
    warnings: [],
    errors: [],
  };
}

function bumpDeleted(summary: DemoCleanupSummary, table: string, n = 1) {
  summary.deleted[table] = (summary.deleted[table] ?? 0) + n;
}

/**
 * Removes only First Church demo seed records.
 * Never deletes the platform administrator auth account.
 */
export async function cleanupFirstChurchDemoSeed(): Promise<DemoCleanupSummary> {
  const summary = emptyCleanupSummary();
  const env = validateDemoSeedCleanupEnv();
  if (!env.ok) {
    summary.errors.push(env.error);
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  try {
    const admin = createAdminClient();
    summary.logs.push(`Starting demo cleanup (${DEMO_SEED_SOURCE})`);

    const { data: church } = await admin
      .from("organizations")
      .select("id")
      .eq("seed_source", DEMO_SEED_SOURCE)
      .maybeSingle();
    summary.organizationId = church?.id ? String(church.id) : null;

    const { data: records, error: listError } = await admin
      .from("demo_seed_records")
      .select("id, entity_table, entity_id, seed_key")
      .eq("seed_source", DEMO_SEED_SOURCE);

    if (listError) {
      throw new Error(`Failed to list demo_seed_records: ${listError.message}`);
    }

    const byTable = new Map<string, Array<{ id: string; entityId: string; seedKey: string }>>();
    for (const row of records ?? []) {
      const table = String(row.entity_table);
      const list = byTable.get(table) ?? [];
      list.push({
        id: String(row.id),
        entityId: String(row.entity_id),
        seedKey: String(row.seed_key),
      });
      byTable.set(table, list);
    }

    const profileRows = byTable.get("profiles") ?? [];
    byTable.delete("profiles");

    const orderedTables = [
      ...DEMO_CLEANUP_TABLE_ORDER,
      ...[...byTable.keys()].filter(
        (t) => !(DEMO_CLEANUP_TABLE_ORDER as readonly string[]).includes(t),
      ),
    ];

    for (const table of orderedTables) {
      const rows = byTable.get(table) ?? [];
      if (rows.length === 0) continue;

      // Membership/church deletes need trigger bypass via service-role RPCs.
      if (table === "organization_memberships" || table === "organizations") {
        continue;
      }

      for (const row of rows) {
        const { error } = await admin.from(table).delete().eq("id", row.entityId);
        if (error) {
          summary.warnings.push(
            `Could not delete ${table}/${row.entityId} (${row.seedKey}): ${error.message}`,
          );
          continue;
        }
        bumpDeleted(summary, table);
        await admin.from("demo_seed_records").delete().eq("id", row.id);
      }
      summary.logs.push(`Deleted registered rows from ${table}`);
    }

    // Memberships require bypass; delete via RPC then purge church (cascades rest).
    const membershipRows = byTable.get("organization_memberships") ?? [];
    for (const row of membershipRows) {
      const { data: deleted, error } = await admin.rpc(
        "demo_seed_delete_membership",
        {
          p_membership_id: row.entityId,
          p_seed_source: DEMO_SEED_SOURCE,
        },
      );
      if (error) {
        summary.warnings.push(
          `Membership delete ${row.seedKey}: ${error.message}`,
        );
        continue;
      }
      if (deleted) bumpDeleted(summary, "organization_memberships");
      await admin.from("demo_seed_records").delete().eq("id", row.id);
    }

    if (summary.organizationId || byTable.has("organizations")) {
      const { data: deletedOrganizationId, error: churchDeleteError } = await admin.rpc(
        "demo_seed_delete_organization",
        { p_seed_source: DEMO_SEED_SOURCE },
      );
      if (churchDeleteError) {
        summary.warnings.push(`Church delete: ${churchDeleteError.message}`);
      } else if (deletedOrganizationId) {
        bumpDeleted(summary, "organizations");
        summary.logs.push("Deleted demo church via service-role RPC");
        for (const row of byTable.get("organizations") ?? []) {
          await admin.from("demo_seed_records").delete().eq("id", row.id);
        }
      }
    }

    // Auth users created for this seed — never the platform admin.
    const deletableEmails = new Set([
      ...DEMO_NAMED_USERS.map((u) => u.email.toLowerCase()),
      ...DEMO_EXTRA_MEMBERS.map((u) => u.email.toLowerCase()),
    ]);

    for (const row of profileRows) {
      const metaEmail =
        typeof row.seedKey === "string" ? row.seedKey : "";
      void metaEmail;

      const { data: userData } = await admin.auth.admin.getUserById(row.entityId);
      const email = userData.user?.email?.toLowerCase() ?? "";

      if (!email || email === DEMO_OWNER_PLATFORM_EMAIL.toLowerCase()) {
        summary.skipped.push(
          `Preserved platform admin auth user (${DEMO_OWNER_PLATFORM_EMAIL})`,
        );
        await admin.from("demo_seed_records").delete().eq("id", row.id);
        continue;
      }

      if (!deletableEmails.has(email)) {
        summary.skipped.push(
          `Skipped auth delete for non-demo email registry row ${row.seedKey}`,
        );
        await admin.from("demo_seed_records").delete().eq("id", row.id);
        continue;
      }

      const { error: delUserError } = await admin.auth.admin.deleteUser(
        row.entityId,
      );
      if (delUserError) {
        summary.warnings.push(
          `Auth user delete failed ${email}: ${delUserError.message}`,
        );
      } else {
        bumpDeleted(summary, "auth.users");
        summary.logs.push(`Deleted demo auth user ${email}`);
      }
      await admin.from("demo_seed_records").delete().eq("id", row.id);
    }

    // Clear any leftover registry rows for this seed source.
    await admin
      .from("demo_seed_records")
      .delete()
      .eq("seed_source", DEMO_SEED_SOURCE);

    summary.ok = summary.errors.length === 0;
    summary.logs.push(
      summary.ok
        ? "Demo cleanup completed"
        : "Demo cleanup finished with errors",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Demo cleanup failed unexpectedly.";
    summary.errors.push(message);
    summary.ok = false;
    console.error(`[demo-seed-cleanup] ERROR ${message}`);
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}
