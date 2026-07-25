import { Suspense, type ReactNode } from "react";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { requirePlatformAccount } from "@/lib/platform/auth";

function SetupFallback() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 w-56 rounded bg-slate-800" />
      <div className="h-4 w-full max-w-lg rounded bg-slate-800" />
    </div>
  );
}

async function PlatformSetupGate({ children }: { children: ReactNode }) {
  try {
    await requirePlatformAccount();
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  return children;
}

export default function PlatformSetupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<SetupFallback />}>
      <PlatformSetupGate>{children}</PlatformSetupGate>
    </Suspense>
  );
}
