import { Suspense } from "react";
import { DemoSeedPanel } from "@/components/platform/demo-seed-panel";
import { DEMO_CHURCH_NAME, DEMO_SEED_SOURCE } from "@/lib/demo-seed/constants";
import { isDemoSeedEnvironmentAllowed } from "@/lib/demo-seed/env";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function DemoSeedContent() {
  await requirePlatformPermission("developer.tools.access");

  let churchId: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("organizations")
      .select("id")
      .eq("seed_source", DEMO_SEED_SOURCE)
      .maybeSingle();
    churchId = data?.id ? String(data.id) : null;
  } catch {
    churchId = null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo seed</h1>
        <p className="mt-1 text-sm text-slate-400">
          Provision or remove the fictitious{" "}
          <span className="text-slate-200">{DEMO_CHURCH_NAME}</span> testing
          environment (<code className="font-mono text-xs">{DEMO_SEED_SOURCE}</code>
          ). Development / preview / staging only unless explicitly authorized.
        </p>
      </div>
      <DemoSeedPanel
        environmentAllowed={isDemoSeedEnvironmentAllowed()}
        churchId={churchId}
      />
    </div>
  );
}

export default function DemoSeedPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-48 rounded bg-slate-800" />
          <div className="h-4 w-full max-w-xl rounded bg-slate-800" />
        </div>
      }
    >
      <DemoSeedContent />
    </Suspense>
  );
}
