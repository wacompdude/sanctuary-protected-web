import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { PlatformConsoleNav } from "@/components/platform/platform-console-nav";
import { PlatformSupportModeBanner } from "@/components/platform/platform-support-mode-banner";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import {
  recordPlatformLogin,
  requirePlatformConsoleAccess,
} from "@/lib/platform/auth";
import { getActivePlatformSupportSession } from "@/lib/platform/support-sessions";

function ConsoleFallback() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 w-48 rounded bg-slate-800" />
      <div className="h-4 w-full max-w-xl rounded bg-slate-800" />
    </div>
  );
}

async function PlatformConsoleShell({ children }: { children: ReactNode }) {
  try {
    const context = await requirePlatformConsoleAccess();
    void recordPlatformLogin(context.account.id);

    const headerStore = await headers();
    const pathname =
      headerStore.get("x-pathname") ||
      headerStore.get("x-invoke-path") ||
      "/platform";

    const supportSession = context.permissions.has("churches.support_access")
      ? await getActivePlatformSupportSession(context)
      : null;

    return (
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-56">
          <div className="mb-4 rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
            <p className="font-medium text-slate-200">
              {context.account.display_name || context.account.email_snapshot}
            </p>
            <p className="mt-1 truncate">{context.account.email_snapshot}</p>
            <p className="mt-2 text-slate-500">
              Roles: {context.roleKeys.join(", ") || "none"}
            </p>
          </div>
          <PlatformConsoleNav
            permissions={context.permissions}
            pathname={pathname}
          />
        </aside>
        <div className="min-w-0 flex-1">
          {supportSession ? (
            <PlatformSupportModeBanner session={supportSession} />
          ) : null}
          {children}
        </div>
      </div>
    );
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
    return null;
  }
}

export default function PlatformConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<ConsoleFallback />}>
      <PlatformConsoleShell>{children}</PlatformConsoleShell>
    </Suspense>
  );
}
