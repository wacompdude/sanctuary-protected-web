/**
 * Phase A: churchId / ChurchId → organizationId / OrganizationId in TS/TSX.
 * Does not touch UI copy, routes, or p_church_id RPC argument names.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SKIP_DIR =
  /(?:^|[\\/])(?:node_modules|\.next|\.git|supabase[\\/]migrations)(?:[\\/]|$)/i;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.test(p + path.sep)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

function transform(src) {
  let out = src;
  // Protect RPC arg keys that must remain until SQL Phase B
  out = out.split("p_church_id").join("__KEEP_P_CHURCH_ID__");
  out = out.split("requested_church_id").join("__KEEP_REQUESTED_CHURCH_ID__");

  // Identifier renames (order: longer / Pascal first)
  out = out.split("ChurchId").join("OrganizationId");
  out = out.split("churchId").join("organizationId");

  out = out.split("__KEEP_P_CHURCH_ID__").join("p_church_id");
  out = out.split("__KEEP_REQUESTED_CHURCH_ID__").join("requested_church_id");
  return out;
}

const touched = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes("churchId") && !original.includes("ChurchId")) continue;
  const next = transform(original);
  if (next !== original) {
    fs.writeFileSync(file, next);
    touched.push(rel);
  }
}

console.log(`Changed files: ${touched.length}`);
touched.sort().forEach((f) => console.log(` - ${f}`));
