"use client";

import { useEffect, useRef } from "react";
import { syncActiveChurchCookie } from "@/app/(app)/church/actions";

/** Writes the validated active-church cookie when the server resolved a replacement. */
export function SyncActiveChurchCookie({ organizationId }: { organizationId: string }) {
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    void syncActiveChurchCookie(organizationId);
  }, [organizationId]);

  return null;
}
