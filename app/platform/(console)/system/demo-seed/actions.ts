"use server";

import { requirePlatformPermission } from "@/lib/platform/auth";
import { isDemoSeedEnvironmentAllowed } from "@/lib/demo-seed/env";
import { runFirstChurchDemoSeed } from "@/lib/demo-seed/run";
import { cleanupFirstChurchDemoSeed } from "@/lib/demo-seed/cleanup";
import type { DemoSeedSummary } from "@/lib/demo-seed/types";
import type { DemoCleanupSummary } from "@/lib/demo-seed/cleanup";

export type DemoSeedActionResult =
  | { ok: true; kind: "seed"; summary: DemoSeedSummary }
  | { ok: true; kind: "cleanup"; summary: DemoCleanupSummary }
  | { ok: false; error: string };

function confirmPhrase(formData: FormData, expected: string): string | null {
  const value = String(formData.get("confirm") ?? "").trim();
  if (value !== expected) {
    return `Type ${expected} exactly to confirm.`;
  }
  return null;
}

export async function runDemoSeedAction(
  _prev: DemoSeedActionResult | null,
  formData: FormData,
): Promise<DemoSeedActionResult> {
  try {
    await requirePlatformPermission("developer.tools.access");
  } catch {
    return { ok: false, error: "Missing developer.tools.access permission." };
  }

  if (!isDemoSeedEnvironmentAllowed()) {
    return {
      ok: false,
      error:
        "Demo seed is blocked in this environment. Use a non-production project or set DEMO_SEED_ALLOW_PRODUCTION=true.",
    };
  }

  const confirmError = confirmPhrase(formData, "SEED");
  if (confirmError) return { ok: false, error: confirmError };

  const summary = await runFirstChurchDemoSeed();
  if (!summary.ok) {
    return {
      ok: false,
      error: summary.errors[0] ?? "Demo seed failed.",
    };
  }
  return { ok: true, kind: "seed", summary };
}

export async function cleanupDemoSeedAction(
  _prev: DemoSeedActionResult | null,
  formData: FormData,
): Promise<DemoSeedActionResult> {
  try {
    await requirePlatformPermission("developer.tools.access");
  } catch {
    return { ok: false, error: "Missing developer.tools.access permission." };
  }

  if (!isDemoSeedEnvironmentAllowed()) {
    return {
      ok: false,
      error:
        "Demo cleanup is blocked in this environment. Use a non-production project or set DEMO_SEED_ALLOW_PRODUCTION=true.",
    };
  }

  const confirmError = confirmPhrase(formData, "CLEANUP");
  if (confirmError) return { ok: false, error: confirmError };

  const summary = await cleanupFirstChurchDemoSeed();
  if (!summary.ok) {
    return {
      ok: false,
      error: summary.errors[0] ?? "Demo cleanup failed.",
    };
  }
  return { ok: true, kind: "cleanup", summary };
}
