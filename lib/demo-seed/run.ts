import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEMO_CHURCH_NAME,
  DEMO_ROLE_MAP,
  DEMO_SEED_SOURCE,
} from "@/lib/demo-seed/constants";
import { validateDemoSeedEnv } from "@/lib/demo-seed/env";
import { seedChurchCore } from "@/lib/demo-seed/seed-core";
import { seedChurchOperations } from "@/lib/demo-seed/seed-operations";
import type { DemoSeedSummary } from "@/lib/demo-seed/types";
import { emptyBucket, log } from "@/lib/demo-seed/types";

export function createEmptyDemoSeedSummary(): DemoSeedSummary {
  return {
    seedSource: DEMO_SEED_SOURCE,
    churchId: null,
    churchName: DEMO_CHURCH_NAME,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: false,
    counts: {
      church: emptyBucket(),
      campuses: emptyBucket(),
      users: emptyBucket(),
      memberships: emptyBucket(),
      subscription: emptyBucket(),
      contacts: emptyBucket(),
      notification_preferences: emptyBucket(),
    },
    roleMapping: { ...DEMO_ROLE_MAP },
    testAccounts: [],
    logs: [],
    warnings: [],
    errors: [],
  };
}

/**
 * Idempotent First Church of the First Church demo seed.
 * Requires service role + DEMO_SEED_TEMP_PASSWORD. Never logs passwords.
 */
export async function runFirstChurchDemoSeed(): Promise<DemoSeedSummary> {
  const summary = createEmptyDemoSeedSummary();
  const env = validateDemoSeedEnv();
  if (!env.ok) {
    summary.errors.push(env.error);
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  try {
    const admin = createAdminClient();
    log(summary, `Starting demo seed (${DEMO_SEED_SOURCE})`);

    const ctx = await seedChurchCore({
      admin,
      seedSource: DEMO_SEED_SOURCE,
      tempPassword: env.tempPassword,
      summary,
    });

    await seedChurchOperations(ctx);

    summary.ok = summary.errors.length === 0;
    log(
      summary,
      summary.ok
        ? "Demo seed completed successfully"
        : "Demo seed finished with errors",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Demo seed failed unexpectedly.";
    // Never echo password if somehow present
    const redacted =
      env.ok && message.includes(env.tempPassword)
        ? "Demo seed failed (details redacted)."
        : message;
    summary.errors.push(redacted);
    summary.ok = false;
    console.error(`[demo-seed] ERROR ${redacted}`);
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}
