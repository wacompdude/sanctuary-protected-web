/**
 * Move lib/church → lib/organization, retarget imports, leave thin re-exports.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "lib", "church");
const destDir = path.join(root, "lib", "organization");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

if (!fs.existsSync(srcDir)) {
  console.error("lib/church missing");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const churchFiles = fs
  .readdirSync(srcDir)
  .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));

for (const name of churchFiles) {
  const from = path.join(srcDir, name);
  const to = path.join(destDir, name);
  let text = fs.readFileSync(from, "utf8");
  text = text.replaceAll("@/lib/organization/", "@/lib/organization/");
  text = text.replaceAll('@/lib/organization"', '@/lib/organization"');
  text = text.replaceAll("@/lib/organization'", "@/lib/organization'");
  fs.writeFileSync(to, text);
  console.log("wrote", path.relative(root, to));
}

const textExt = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".md",
  ".json",
]);

let importUpdates = 0;
for (const file of walk(root)) {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  if (rel.startsWith("lib/church/")) continue;
  if (rel.startsWith("lib/organization/")) continue;
  if (!textExt.has(path.extname(file))) continue;

  const before = fs.readFileSync(file, "utf8");
  if (!before.includes("@/lib/organization")) continue;
  const after = before
    .replaceAll("@/lib/organization/", "@/lib/organization/")
    .replaceAll('@/lib/organization"', '@/lib/organization"')
    .replaceAll("@/lib/organization'", "@/lib/organization'");
  if (after !== before) {
    fs.writeFileSync(file, after);
    importUpdates += 1;
    console.log("import", rel);
  }
}

for (const name of churchFiles) {
  const base = name.replace(/\.tsx?$/, "");
  const shim = `export * from "@/lib/organization/${base}";\n`;
  fs.writeFileSync(path.join(srcDir, name), shim);
  console.log("shim", path.join("lib/church", name));
}

console.log(`Done. Updated ${importUpdates} import file(s).`);
