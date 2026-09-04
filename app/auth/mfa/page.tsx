import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthPageShell } from "@/components/auth-page-shell";
import { LoginMfaForm } from "@/components/mfa/login-mfa-form";
import { skipLoginMfaIfNotRequired } from "@/app/auth/mfa/actions";
import { isPlatformDestination } from "@/lib/mfa/effective-policy";
import { maskEmailForMfa, maskPhoneForMfa } from "@/lib/mfa/mask";
import {
  getLoginMfaContext,
  safeMfaNextPath,
} from "@/lib/mfa/login";
import { getEffectiveMfaPolicy } from "@/lib/mfa/resolve-policy";
import { hasSatisfiedLoginMfa } from "@/lib/mfa/gate";
import { readActiveOrganizationCookie } from "@/lib/organization/cookie";
import { readMfaCookieValue } from "@/lib/mfa/session";
import {
  recordDeviceVerificationRequired,
  recordTrustedDeviceValidationFailure,
  validateTrustedDevice,
} from "@/lib/mfa/trusted-devices";
import { readTrustedDeviceCookieValue } from "@/lib/mfa/trusted-device-session";
import { UNRECOGNIZED_DEVICE_MESSAGE } from "@/lib/mfa/trusted-device-policy";
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

  const policy = await getEffectiveMfaPolicy({
    userId: ctx.userId,
    pathname: nextPath,
  });
  if (policy.needsOrganizationSelection) {
    redirect(
      `/auth/select-organization?next=${encodeURIComponent(nextPath)}`,
    );
  }

  const cookieValue = await readMfaCookieValue();
  const organizationId = await readActiveOrganizationCookie();
  if (
    await hasSatisfiedLoginMfa({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      cookieValue,
      organizationId,
      platformDestination: isPlatformDestination(nextPath),
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

  const trustedCookie = await readTrustedDeviceCookieValue();
  const trusted = await validateTrustedDevice({
    userId: ctx.userId,
    cookieValue: trustedCookie,
  });
  if (!trusted.ok) {
    if (trusted.reason === "expired") {
      await recordTrustedDeviceValidationFailure({
        userId: ctx.userId,
        reason: "expired",
      });
    } else if (trusted.reason !== "missing") {
      await recordTrustedDeviceValidationFailure({
        userId: ctx.userId,
        reason: trusted.reason,
      });
    }
    await recordDeviceVerificationRequired(ctx.userId);
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

  return (
    <LoginMfaForm
      nextPath={nextPath}
      initialView={initialView}
      unrecognizedDeviceMessage={UNRECOGNIZED_DEVICE_MESSAGE}
    />
  );
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
