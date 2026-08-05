/**
 * CLI: seed First Church of the First Church demo environment.
 *
 * Usage:
 *   1. Apply supabase/migrations/055_demo_seed_infrastructure.sql
 *   2. Ensure platform admin exists (npm run bootstrap:super-admin)
 *   3. Set in .env.local (never commit):
 *        DEMO_SEED_TEMP_PASSWORD=<strong temporary password>
 *        SUPABASE_SERVICE_ROLE_KEY=...
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *   4. npm run seed:first-church-demo
 *
 * Never pass the password as a CLI argument. This script never prints it.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { runFirstChurchDemoSeed } from "../lib/demo-seed/run";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv(): void {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env.local"));
  loadEnvFile(resolve(root, ".env"));
}

async function main(): Promise<void> {
  loadLocalEnv();
  const summary = await runFirstChurchDemoSeed();

  const safe = {
    ok: summary.ok,
    seedSource: summary.seedSource,
    organizationId: summary.organizationId,
    churchName: summary.churchName,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    counts: summary.counts,
    roleMapping: summary.roleMapping,
    testAccounts: summary.testAccounts,
    warnings: summary.warnings,
    errors: summary.errors,
    logCount: summary.logs.length,
  };

  console.log(JSON.stringify(safe, null, 2));
  if (!summary.ok) process.exitCode = 1;
  delete process.env.DEMO_SEED_TEMP_PASSWORD;
}

void main();
