/**
 * Demo snapshot Phase 3 guardrails self-check (no database).
 * Run: npx --yes tsx lib/platform/demo-snapshots/foundation.selfcheck.ts
 */
import { isDemoRestoreEligible } from "@/lib/platform/demo-snapshots/guardrails";
import {
  DEMO_RESTORE_CONFIRMATION_PHRASE,
  DEMO_SNAPSHOT_FORMAT_VERSION,
  DEMO_SNAPSHOT_PERMISSIONS,
  DEMO_SNAPSHOT_STORAGE_BUCKET,
  deleteOrder,
  exportInsertOrder,
  SNAPSHOT_TABLE_REGISTRY,
  tablesForStrategy,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import { PLATFORM_PERMISSIONS } from "@/lib/platform/permission-keys";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(DEMO_SNAPSHOT_FORMAT_VERSION === 1, "format version");
assert(
  DEMO_SNAPSHOT_STORAGE_BUCKET === "demo-organization-snapshots",
  "bucket name",
);
assert(
  DEMO_RESTORE_CONFIRMATION_PHRASE === "RESTORE FIRST CHURCH DEMO",
  "confirm phrase",
);

assert(SNAPSHOT_TABLE_REGISTRY.length > 40, "registry size");
assert(tablesForStrategy("exclude").length >= 3, "has excludes");
assert(
  tablesForStrategy("merge").some((t) => t.tableName === "organizations"),
  "org merge",
);
assert(
  tablesForStrategy("merge").some(
    (t) => t.tableName === "organization_memberships",
  ),
  "membership merge",
);

const insert = exportInsertOrder();
const del = deleteOrder();
assert(
  insert[0].dependencyOrder <= insert[insert.length - 1].dependencyOrder,
  "insert sorted",
);
assert(
  del[0].tableName === insert[insert.length - 1].tableName,
  "delete reverse",
);

for (const key of DEMO_SNAPSHOT_PERMISSIONS) {
  assert(
    (PLATFORM_PERMISSIONS as readonly string[]).includes(key),
    `permission wired: ${key}`,
  );
}

assert(
  isDemoRestoreEligible({
    is_demo_organization: true,
    demo_restore_enabled: true,
    demo_restore_locked: false,
  }),
  "eligible true",
);
assert(
  !isDemoRestoreEligible({
    is_demo_organization: true,
    demo_restore_enabled: true,
    demo_restore_locked: true,
  }),
  "locked blocks",
);
assert(
  !isDemoRestoreEligible({
    is_demo_organization: false,
    demo_restore_enabled: true,
    demo_restore_locked: false,
  }),
  "non-demo blocks",
);

console.log("demo-snapshots Phase 3 foundation self-check passed");
