/**
 * Server-only CLI: bootstrap the initial platform super administrator.
 *
 * Usage:
 *   1. Apply supabase/migrations/044_platform_administration.sql
 *   2. Set in .env.local (never commit real values):
 *        SUPER_ADMIN_BOOTSTRAP_ENABLED=true
 *        SUPER_ADMIN_BOOTSTRAP_EMAIL=repus_admin@sanctuaryprotected.com
 *        SUPER_ADMIN_BOOTSTRAP_PASSWORD=<strong temporary password>
 *        SUPABASE_SERVICE_ROLE_KEY=...
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *   3. npm run bootstrap:super-admin
 *   4. Set SUPER_ADMIN_BOOTSTRAP_ENABLED=false and clear the password
 *
 * Never pass the password as a CLI argument (shell history / process list).
 * This script never prints the password.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  bootstrapSuperAdmin,
  validateBootstrapEnv,
} from "../lib/platform/bootstrap";

process.env.SUPER_ADMIN_BOOTSTRAP_CLI = "1";

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

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function safeFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Bootstrap failed.";
  const message = error.message || "Bootstrap failed.";
  // Belt-and-suspenders: never echo anything that looks like the password env.
  const password = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD;
  if (password && message.includes(password)) {
    return "Bootstrap failed with a sensitive error (details redacted).";
  }
  return message;
}

async function main(): Promise<void> {
  loadLocalEnv();

  const validation = validateBootstrapEnv({
    enabled: process.env.SUPER_ADMIN_BOOTSTRAP_ENABLED,
    email: process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL,
    password: process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!validation.ok) {
    console.error(`Bootstrap aborted: ${validation.error}`);
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = normalizeSupabaseUrl(
    String(process.env.NEXT_PUBLIC_SUPABASE_URL),
  );
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const result = await bootstrapSuperAdmin({
      admin,
      email: validation.email,
      password: validation.password,
    });

    console.log("Platform super admin bootstrap complete.");
    console.log(
      JSON.stringify(
        {
          email: result.email,
          userId: result.userId,
          platformAccountId: result.platformAccountId,
          authUserCreated: result.authUserCreated,
          authUserExisted: result.authUserExisted,
          platformAccountCreated: result.platformAccountCreated,
          platformAccountExisted: result.platformAccountExisted,
          roleAssigned: result.roleAssigned,
          roleAlreadyAssigned: result.roleAlreadyAssigned,
          passwordWasSetOnCreate: result.passwordWasSetOnCreate,
          auditWritten: result.auditWritten,
          mustChangePassword: result.mustChangePassword,
          mfaRequired: result.mfaRequired,
        },
        null,
        2,
      ),
    );
    console.log(result.reminder);
  } catch (error) {
    console.error(`Bootstrap failed: ${safeFailureMessage(error)}`);
    process.exitCode = 1;
  } finally {
    // Drop password from this process env after use.
    delete process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD;
  }
}

void main();
