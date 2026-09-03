import { isMfaLoginEnabled } from "@/lib/mfa/policy";
import { verifyMfaCookie } from "@/lib/mfa/session-cookie";

export async function hasSatisfiedLoginMfa(input: {
  userId: string;
  sessionId: string;
  cookieValue: string | undefined;
}): Promise<boolean> {
  if (!isMfaLoginEnabled()) return true;
  return verifyMfaCookie({
    token: input.cookieValue,
    userId: input.userId,
    sessionId: input.sessionId,
  });
}
