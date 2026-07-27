/**
 * CLI: remove First Church of the First Church demo seed data only.
 *
 * Usage:
 *   npm run seed:first-church-demo:cleanup
 *
 * Never deletes the platform administrator auth account.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { cleanupFirstChurchDemoSeed } from "../lib/demo-seed/cleanup";

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
  const summary = await cleanupFirstChurchDemoSeed();
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

void main();
