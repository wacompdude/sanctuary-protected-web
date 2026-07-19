import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmergencyPolicyBadge } from "@/components/policies/policy-status-badge";
import type { PolicyDocumentListItem } from "@/lib/policies/types";
import { labelForPolicyDocumentType } from "@/lib/policies/constants";

export function EmergencyPolicyCard({
  policy,
}: {
  policy: PolicyDocumentListItem;
}) {
  return (
    <Link
      href={`/policies/${policy.id}`}
      className="flex h-full flex-col rounded-md border border-red-600/50 bg-red-600/10 p-4 transition-colors hover:bg-red-600/15"
    >
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-300" />
        <EmergencyPolicyBadge />
      </div>
      <p className="font-semibold leading-snug text-foreground">{policy.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {labelForPolicyDocumentType(policy.document_type)}
        {policy.version_label ? ` · v${policy.version_label}` : ""}
      </p>
    </Link>
  );
}
