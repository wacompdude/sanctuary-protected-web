"use server";

import { getRequestIpAddress } from "@/lib/audit/request-ip";

/** Best-effort client IP for login audit metadata. Auth is not required. */
export async function getLoginAuditIpAddress(): Promise<string | null> {
  return getRequestIpAddress();
}
