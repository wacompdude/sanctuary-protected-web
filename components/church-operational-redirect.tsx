"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isChurchRecoveryPath } from "@/lib/church/operations";

/** Client-side gate: keep suspended/closed churches on recovery routes. */
export function ChurchOperationalRedirect({
  locked,
}: {
  locked: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!locked) return;
    if (!pathname || isChurchRecoveryPath(pathname)) return;
    router.replace("/settings/church/danger");
  }, [locked, pathname, router]);

  return null;
}
