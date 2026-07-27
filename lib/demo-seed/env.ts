import { DEMO_SEED_SOURCE } from "@/lib/demo-seed/constants";

export type DemoSeedEnvValidation =
  | { ok: true; tempPassword: string; allowProduction: boolean }
  | { ok: false; error: string };

/**
 * Demo seed is allowed in local/dev/preview/staging.
 * Production requires DEMO_SEED_ALLOW_PRODUCTION=true explicitly.
 */
export function isDemoSeedEnvironmentAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const vercelEnv = (env.VERCEL_ENV ?? "").toLowerCase();
  const nodeEnv = (env.NODE_ENV ?? "").toLowerCase();
  const allowProduction = env.DEMO_SEED_ALLOW_PRODUCTION === "true";

  if (allowProduction) return true;
  if (vercelEnv === "production" || nodeEnv === "production") {
    // Still allow when Vercel preview/staging labels appear.
    if (vercelEnv === "preview" || vercelEnv === "development") return true;
    return false;
  }
  return true;
}

function validateDemoSeedBaseEnv(
  env: NodeJS.ProcessEnv,
): { ok: true } | { ok: false; error: string } {
  if (!isDemoSeedEnvironmentAllowed(env)) {
    return {
      ok: false,
      error:
        "Demo seed is blocked in production. Set DEMO_SEED_ALLOW_PRODUCTION=true only for an authorized test project.",
    };
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    return { ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_URL." };
  }

  return { ok: true };
}

export function validateDemoSeedEnv(
  env: NodeJS.ProcessEnv = process.env,
): DemoSeedEnvValidation {
  const base = validateDemoSeedBaseEnv(env);
  if (!base.ok) return base;

  const tempPassword = env.DEMO_SEED_TEMP_PASSWORD?.trim() ?? "";
  if (tempPassword.length < 10) {
    return {
      ok: false,
      error:
        "Set DEMO_SEED_TEMP_PASSWORD in the environment (min 10 chars). Do not commit the password.",
    };
  }

  return {
    ok: true,
    tempPassword,
    allowProduction: env.DEMO_SEED_ALLOW_PRODUCTION === "true",
  };
}

/** Cleanup needs service role + env gate, but not the temp password. */
export function validateDemoSeedCleanupEnv(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; error: string } {
  return validateDemoSeedBaseEnv(env);
}

export function demoSeedSource(): string {
  return DEMO_SEED_SOURCE;
}
