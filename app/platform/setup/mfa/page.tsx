import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PlatformMfaSetupForm } from "@/components/platform/platform-mfa-setup-form";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { requirePlatformAccount } from "@/lib/platform/auth";
import { PLATFORM_SETUP_PASSWORD_PATH } from "@/lib/platform/routes";

async function PlatformMfaSetupContent() {
  try {
    const { account } = await requirePlatformAccount();
    if (account.must_change_password) {
      redirect(PLATFORM_SETUP_PASSWORD_PATH);
    }
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Enroll platform MFA
      </h1>
      <p className="max-w-xl text-sm text-slate-300">
        All platform accounts require an authenticator app. Scan the QR code,
        verify a code, then continue to the console.
      </p>
      <PlatformMfaSetupForm />
    </div>
  );
}

export default function PlatformMfaSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-56 rounded bg-slate-800" />
          <div className="h-4 w-full max-w-lg rounded bg-slate-800" />
        </div>
      }
    >
      <PlatformMfaSetupContent />
    </Suspense>
  );
}
