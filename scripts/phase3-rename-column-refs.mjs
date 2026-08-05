/**
 * Phase 3 helper: rename quoted/object church_* COLUMN identifiers after 072.
 * Run: node scripts/phase3-rename-column-refs.mjs
 *
 * Updates:
 *   church_membership_id → organization_membership_id
 *   church_id → organization_id
 *
 * Does NOT change:
 *   p_church_id / requested_church_id (RPC param names kept by 072)
 *   churchId / church_id camelCase TS props (handled separately if needed)
 *   UI copy, routes, historical migrations 001-071
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SKIP_DIR =
  /(?:^|[\\/])(?:node_modules|\.next|\.git|supabase[\\/]migrations[\\/]0)(?:[\\/]|$)/i;

const EXT = /\.(ts|tsx|js|jsx|mjs)$/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.test(p + path.sep)) continue;
      walk(p, out);
    } else if (EXT.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

function transform(src) {
  let out = src;

  // Protect RPC / helper identifiers that must keep church_id in the name
  const protections = [
    ["p_church_id", "__KEEP_P_CHURCH_ID__"],
    ["requested_church_id", "__KEEP_REQUESTED_CHURCH_ID__"],
    ["v_church_id", "__KEEP_V_CHURCH_ID__"],
    ["v_incident_church_id", "__KEEP_V_INCIDENT_CHURCH_ID__"],
    ["v_membership_church_id", "__KEEP_V_MEMBERSHIP_CHURCH_ID__"],
    ["user_church_id", "__KEEP_USER_CHURCH_ID__"],
    ["church_id_from_", "__KEEP_CHURCH_ID_FROM__"],
  ];

  for (const [from, to] of protections) {
    out = out.split(from).join(to);
  }

  // Longer column first
  out = out.split("church_membership_id").join("organization_membership_id");
  out = out.split("church_id").join("organization_id");

  // Restore protections
  for (const [from, to] of protections) {
    out = out.split(to).join(from);
  }

  return out;
}

const files = walk(ROOT);
const touched = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  // Skip this script and the table-rename helpers
  if (rel.startsWith("scripts/phase3-rename-column-refs")) continue;

  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("church_id") && !original.includes("church_membership_id")) {
    continue;
  }

  const next = transform(original);
  if (next !== original) {
    fs.writeFileSync(file, next);
    touched.push(rel);
  }
}

console.log(`Changed files: ${touched.length}`);
touched.sort().forEach((f) => console.log(` - ${f}`));
