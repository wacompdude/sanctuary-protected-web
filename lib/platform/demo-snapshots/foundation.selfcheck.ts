/**
 * Demo snapshot foundation self-check (no database).
 * Run: npx --yes tsx lib/platform/demo-snapshots/foundation.selfcheck.ts
 */
import { sha256Prefixed, stableStringify } from "@/lib/platform/demo-snapshots/checksum";
import { isDemoRestoreEligible } from "@/lib/platform/demo-snapshots/guardrails";
import {
  snapshotDataObjectPath,
  snapshotFileObjectPath,
  snapshotManifestObjectPath,
} from "@/lib/platform/demo-snapshots/paths";
import {
  DEMO_DATABASE_SCHEMA_VERSION,
  DEMO_RESTORE_CONFIRMATION_PHRASE,
  DEMO_SNAPSHOT_FORMAT_VERSION,
  DEMO_SNAPSHOT_PERMISSIONS,
  DEMO_SNAPSHOT_STORAGE_BUCKET,
  deleteOrder,
  exportInsertOrder,
  exportPayloadOrder,
  SNAPSHOT_TABLE_REGISTRY,
  tablesForStrategy,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import { SNAPSHOT_STORAGE_REFS } from "@/lib/platform/demo-snapshots/storage-refs";
import { PLATFORM_PERMISSIONS } from "@/lib/platform/permission-keys";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(DEMO_SNAPSHOT_FORMAT_VERSION === 1, "format version");
assert(DEMO_DATABASE_SCHEMA_VERSION === "081", "schema version stamp");
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

const payload = exportPayloadOrder();
assert(
  payload.every(
    (t) => t.restoreStrategy === "replace" || t.restoreStrategy === "merge",
  ),
  "payload strategies",
);
assert(
  !payload.some((t) => t.tableName === "profiles"),
  "profiles not in payload",
);

const insert = exportInsertOrder();
const del = deleteOrder();
assert(
  insert[0].dependencyOrder <= insert[insert.length - 1].dependencyOrder,
  "insert sorted",
);
assert(
  del.every((t) => t.restoreStrategy === "replace"),
  "delete only replace",
);
assert(del.length > 0, "delete order non-empty");

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

const orgId = "11111111-1111-1111-1111-111111111111";
const snapId = "22222222-2222-2222-2222-222222222222";
assert(
  snapshotManifestObjectPath(orgId, snapId).endsWith("/manifest.json"),
  "manifest path",
);
assert(
  snapshotDataObjectPath(orgId, snapId).endsWith("/data.json"),
  "data path",
);
assert(
  snapshotFileObjectPath(orgId, snapId, "incident-media", "organizations/x/a.jpg")
    .includes("/files/incident-media/"),
  "file path",
);

assert(SNAPSHOT_STORAGE_REFS.length >= 5, "storage refs");
assert(
  SNAPSHOT_STORAGE_REFS.some((r) => r.tableName === "organizations"),
  "org logo ref",
);

const sample = { b: 2, a: { d: 1, c: 0 } };
assert(
  stableStringify(sample) === '{"a":{"c":0,"d":1},"b":2}',
  "stable stringify",
);
assert(sha256Prefixed("demo").startsWith("sha256:"), "checksum prefix");

assert(
  DEMO_RESTORE_CONFIRMATION_PHRASE.length > 10,
  "confirmation phrase length",
);

console.log("demo-snapshots Phase 5 foundation self-check passed");
