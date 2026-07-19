import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  EmergencyPolicyBadge,
  PolicyStatusBadge,
} from "@/components/policies/policy-status-badge";
import { labelForPolicyDocumentType } from "@/lib/policies/constants";
import type { PolicyDocumentListItem } from "@/lib/policies/types";
import { formatChurchDate } from "@/lib/datetime/format";

export function PolicyCard({
  policy,
  timeZone,
}: {
  policy: PolicyDocumentListItem;
  timeZone?: string | null;
}) {
  return (
    <Link href={`/policies/${policy.id}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {policy.is_emergency_document ? <EmergencyPolicyBadge /> : null}
            {policy.requires_acknowledgment ? (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                Acknowledgment required
              </span>
            ) : null}
            {policy.status !== "published" ? (
              <PolicyStatusBadge status={policy.status} />
            ) : null}
          </div>
          <CardTitle className="text-lg leading-snug">{policy.title}</CardTitle>
          <CardDescription>
            {labelForPolicyDocumentType(policy.document_type)}
            {policy.category_label ? ` · ${policy.category_label}` : ""}
            {policy.version_label ? ` · v${policy.version_label}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {policy.summary ? (
            <p className="line-clamp-3">{policy.summary}</p>
          ) : (
            <p className="italic">No summary provided.</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {policy.effective_date ? (
              <span>
                Effective{" "}
                {formatChurchDate(policy.effective_date, { timeZone })}
              </span>
            ) : null}
            <span>
              Updated {formatChurchDate(policy.updated_at, { timeZone })}
            </span>
            {policy.read_time_minutes ? (
              <span>{policy.read_time_minutes} min read</span>
            ) : null}
            {policy.campus_name ? <span>{policy.campus_name}</span> : null}
            {policy.acknowledgment_status ? (
              <span className="capitalize">
                Your status: {policy.acknowledgment_status.replace("_", " ")}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
