import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const out = execSync("npx supabase status -o env", { encoding: "utf8" });
const o = {};
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  o[m[1]] = m[2].replace(/^"|"$/g, "");
}
writeFileSync(
  "scripts/local-rls/_local_status.json",
  JSON.stringify({
    API_URL: o.API_URL,
    ANON_KEY: o.ANON_KEY,
    SERVICE_ROLE_KEY: o.SERVICE_ROLE_KEY,
    DB_URL: o.DB_URL,
  }),
);
console.log("wrote scripts/local-rls/_local_status.json (keys present, values not printed)");
