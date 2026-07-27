/**
 * One-time CLI: reset password for the approved platform super admin Auth user.
 *
 * Usage:
 *   Set in the shell (do not commit):
 *     PLATFORM_ADMIN_RESET_PASSWORD=<new password>
 *   Then:
 *     npx --yes tsx scripts/reset-platform-admin-password.ts
 *
 * Never prints the password. Clears PLATFORM_ADMIN_RESET_PASSWORD from process env when done.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS,
  PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH,
} from "../lib/platform/bootstrap";

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

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const email = (
    process.env.PLATFORM_ADMIN_RESET_EMAIL ??
    APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS[0]
  )
    .trim()
    .toLowerCase();

  const password = process.env.PLATFORM_ADMIN_RESET_PASSWORD ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (
    !(APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS as readonly string[]).includes(email)
  ) {
    console.error("Reset aborted: email is not an approved platform admin address.");
    process.exitCode = 1;
    return;
  }

  if (password.length < PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH) {
    console.error(
      `Reset aborted: PLATFORM_ADMIN_RESET_PASSWORD must be at least ${PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH} characters.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    console.error(
      "Reset aborted: password must include at least one letter and one number.",
    );
    process.exitCode = 1;
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Reset aborted: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
    process.exitCode = 1;
    return;
  }

  const admin = createClient(normalizeSupabaseUrl(supabaseUrl), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: userId, error: lookupError } = await admin.rpc(
      "get_auth_user_id_by_email",
      { p_email: email },
    );

    if (lookupError || !userId) {
      console.error(
        `Reset aborted: could not find Auth user for ${email}. ${lookupError?.message ?? ""}`.trim(),
      );
      process.exitCode = 1;
      return;
    }

    const id = String(userId);

    const { error: updateError } = await admin.auth.admin.updateUserById(id, {
      password,
      email_confirm: true,
      ban_duration: "none",
    });

    if (updateError) {
      const msg = updateError.message.includes(password)
        ? "Auth password update failed (details redacted)."
        : updateError.message;
      console.error(`Reset aborted: ${msg}`);
      process.exitCode = 1;
      return;
    }

    // Clear forced password-change so login is not blocked after reset.
    const { data: account } = await admin
      .from("platform_accounts")
      .select("id")
      .eq("user_id", id)
      .maybeSingle();

    if (account?.id) {
      await admin
        .from("platform_accounts")
        .update({
          status: "active",
          must_change_password: false,
          email_snapshot: email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          userId: id,
          platformAccountId: account?.id ? String(account.id) : null,
          passwordUpdated: true,
          mustChangePasswordCleared: Boolean(account?.id),
        },
        null,
        2,
      ),
    );
  } finally {
    delete process.env.PLATFORM_ADMIN_RESET_PASSWORD;
  }
}

void main();
