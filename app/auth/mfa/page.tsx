import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthPageShell } from "@/components/auth-page-shell";
import { LoginMfaForm } from "@/components/mfa/login-mfa-form";
import { skipLoginMfaIfNotRequired } from "@/app/auth/mfa/actions";
import { maskEmailForMfa, maskPhoneForMfa } from "@/lib/mfa/mask";
import {
  getLoginMfaContext,
  safeMfaNextPath,
} from "@/lib/mfa/login";
import { hasSatisfiedLoginMfa } from "@/lib/mfa/gate";
import { readMfaCookieValue } from "@/lib/mfa/session";
import {
  getOrCreateUserSecuritySettings,
  loginSmsBackupAvailable,
} from "@/lib/mfa/settings";
import type { LoginMfaView } from "@/lib/mfa/types";

async function MfaContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeMfaNextPath(params.next);
  const ctx = await getLoginMfaContext();

  if (!ctx) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const cookieValue = await readMfaCookieValue();
  if (
    await hasSatisfiedLoginMfa({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      cookieValue,
    })
  ) {
    redirect(nextPath);
  }

  try {
    await skipLoginMfaIfNotRequired(nextPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
  }

  const settings = await getOrCreateUserSecuritySettings(ctx.userId).catch(
    () => null,
  );
  const smsBackupAvailable = settings
    ? loginSmsBackupAvailable(settings)
    : false;
  const initialView: LoginMfaView = {
    channel: "email",
    maskedDestination: maskEmailForMfa(ctx.email),
    smsBackupAvailable,
    smsBackupMaskedPhone: settings?.verifiedPhone
      ? maskPhoneForMfa(settings.verifiedPhone)
      : null,
    retryAfterSeconds: 0,
  };

  return <LoginMfaForm nextPath={nextPath} initialView={initialView} />;
}

export default function LoginMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <AuthPageShell>
      <Suspense>
        <MfaContent searchParams={searchParams} />
      </Suspense>
    </AuthPageShell>
  );
}
