import { ShieldAlert } from "lucide-react";
import { SAFETY_CONCERN_RESTRICTED_BANNER } from "@/lib/safety-concerns/constants";

export function SafetyConcernRestrictedBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{SAFETY_CONCERN_RESTRICTED_BANNER}</p>
    </div>
  );
}
