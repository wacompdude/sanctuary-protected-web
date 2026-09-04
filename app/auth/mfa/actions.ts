"use server";

import { redirect } from "next/navigation";
import { mfaCookieFromPolicy } from "@/lib/mfa/effective-policy";
import { isMfaLoginEnabled, type MfaChannel } from "@/lib/mfa/policy";
import {
  getLoginMfaContext,
  isForcedReauthPending,
  safeMfaNextPath,
  shouldSkipLoginMfa,
  startLoginEmailChallenge,
  startLoginSmsChallenge,
  tryCompleteLoginWithTrustedDevice,
  verifyLoginMfaCode,
} from "@/lib/mfa/login";
import { getEffectiveMfaPolicy } from "@/lib/mfa/resolve-policy";
import { writeMfaSessionCookie } from "@/lib/mfa/session";
import { readTrustedDeviceCookieValue } from "@/lib/mfa/trusted-device-session";
import type { MfaActionState } from "@/lib/mfa/types";

function isMfaChannel(value: string): value is MfaChannel {
  return value === "email" || value === "sms";
}

export async function startLoginEmailMfaAction(
  nextPath?: string,
): Promise<MfaActionState> {
  try {
    return await startLoginEmailChallenge(safeMfaNextPath(nextPath));
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send the verification email.",
    };
  }
}

export async function startLoginSmsMfaAction(
  nextPath?: string,
): Promise<MfaActionState> {
  try {
    return await startLoginSmsChallenge(safeMfaNextPath(nextPath));
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send the text message.",
    };
  }
}

export async function verifyLoginMfaAction(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const channelRaw = String(formData.get("channel") ?? "email");
  const channel: MfaChannel = isMfaChannel(channelRaw) ? channelRaw : "email";
  const code = String(formData.get("code") ?? "");
  const trustDevice = formData.get("trust_device") === "1";

  try {
    const result = await verifyLoginMfaCode({ channel, code, trustDevice });
    if (result.verified) {
      redirect(safeMfaNextPath(String(formData.get("next") ?? "")));
    }
    return result;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to verify that code.",
    };
  }
}

export async function skipLoginMfaIfNotRequired(nextPath: string): Promise<void> {
  const dest = safeMfaNextPath(nextPath);
  if (!(await shouldSkipLoginMfa(dest))) return;
  if (!isMfaLoginEnabled()) {
    redirect(dest);
  }
  const ctx = await getLoginMfaContext();
  if (!ctx) return;
  const policy = await getEffectiveMfaPolicy({
    userId: ctx.userId,
    pathname: dest,
  });
  const wrote = await writeMfaSessionCookie({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    ...mfaCookieFromPolicy(policy),
  });
  if (wrote) {
    redirect(dest);
  }
}

export async function skipLoginMfaIfTrustedDevice(nextPath: string): Promise<void> {
  const dest = safeMfaNextPath(nextPath);
  const cookieValue = await readTrustedDeviceCookieValue();
  const skipped = await tryCompleteLoginWithTrustedDevice({
    cookieValue,
    pathname: dest,
    forceFreshMfa: await isForcedReauthPending(dest),
  });
  if (skipped) {
    redirect(dest);
  }
}
