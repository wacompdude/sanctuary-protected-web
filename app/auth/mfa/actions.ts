"use server";

import { redirect } from "next/navigation";
import { isMfaLoginEnabled, type MfaChannel } from "@/lib/mfa/policy";
import {
  getLoginMfaContext,
  safeMfaNextPath,
  shouldSkipLoginMfa,
  startLoginEmailChallenge,
  startLoginSmsChallenge,
  verifyLoginMfaCode,
} from "@/lib/mfa/login";
import { writeMfaSessionCookie } from "@/lib/mfa/session";
import type { MfaActionState } from "@/lib/mfa/types";

function isMfaChannel(value: string): value is MfaChannel {
  return value === "email" || value === "sms";
}

export async function startLoginEmailMfaAction(): Promise<MfaActionState> {
  try {
    return await startLoginEmailChallenge();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send the verification email.",
    };
  }
}

export async function startLoginSmsMfaAction(): Promise<MfaActionState> {
  try {
    return await startLoginSmsChallenge();
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

  try {
    return await verifyLoginMfaCode({ channel, code });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to verify that code.",
    };
  }
}

export async function skipLoginMfaIfNotRequired(nextPath: string): Promise<void> {
  if (!(await shouldSkipLoginMfa())) return;
  const dest = safeMfaNextPath(nextPath);
  if (!isMfaLoginEnabled()) {
    redirect(dest);
  }
  const ctx = await getLoginMfaContext();
  if (!ctx) return;
  const wrote = await writeMfaSessionCookie({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
  });
  if (wrote) {
    redirect(dest);
  }
}
