/**
 * Phase 3 helper: rename quoted Supabase table identifiers for Option A.
 * Run: node scripts/phase3-rename-table-refs.mjs
 *
 * Does not change church_id columns, UI copy, RPC names, or historical migrations.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SKIP_DIR =
  /(?:^|[\\/])(?:node_modules|\.next|\.git|supabase[\\/]migrations[\\/]0)(?:[\\/]|$)/i;

/** Longest-first so church_membership_roles is not partially hit by church_memberships */
const MAP = [
  ["church_membership_roles", "organization_membership_roles"],
  ["church_entitlement_overrides", "organization_entitlement_overrides"],
  ["church_notification_settings", "organization_notification_settings"],
  ["church_schedule_settings", "organization_schedule_settings"],
  ["church_policy_settings", "organization_policy_settings"],
  ["church_threat_levels", "organization_threat_levels"],
  ["church_subscriptions", "organization_subscriptions"],
  ["church_memberships", "organization_memberships"],
  ["church_invitations", "organization_invitations"],
  ["church_contacts", "organization_contacts"],
  ["church_role_settings", "organization_role_settings"],
  ["training_church_settings", "training_organization_settings"],
  ["churches", "organizations"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.test(p + path.sep)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(ROOT);
const touched = [];

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const original = src;
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");

  for (const [oldName, newName] of MAP) {
    src = src.split(`"${oldName}"`).join(`"${newName}"`);
    src = src.split(`'${oldName}'`).join(`'${newName}'`);
  }

  // Platform nav id is a UI route key, not a table name
  if (rel === "lib/platform/navigation.ts") {
    src = src.replace('id: "organizations"', 'id: "churches"');
  }

  if (src !== original) {
    fs.writeFileSync(file, src);
    touched.push(rel);
  }
}

console.log(`Changed files: ${touched.length}`);
touched.sort().forEach((f) => console.log(` - ${f}`));
