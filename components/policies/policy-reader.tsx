import Link from "next/link";
import { PolicyAcknowledgeForm } from "@/components/policies/policy-acknowledge-form";
import { PolicyAttachmentsCard } from "@/components/policies/policy-attachments-card";
import {
  EmergencyPolicyBadge,
  PolicyStatusBadge,
} from "@/components/policies/policy-status-badge";
import { PolicyPrintButton } from "@/components/policies/policy-print-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatChurchDate, formatChurchDateTime } from "@/lib/datetime/format";
import {
  extractPolicyToc,
  PolicyMarkdown,
} from "@/lib/policies/markdown";
import { labelForPolicyDocumentType } from "@/lib/policies/constants";
import type {
  PolicyAcknowledgment,
  PolicyAttachment,
  PolicyDocumentDetail,
} from "@/lib/policies/types";
import { ArrowLeft } from "lucide-react";

export function PolicyReader({
  policy,
  timeZone,
  canManage,
  acknowledgment,
  attachments,
}: {
  policy: PolicyDocumentDetail;
  timeZone?: string | null;
  canManage?: boolean;
  acknowledgment?: PolicyAcknowledgment | null;
  attachments?: PolicyAttachment[];
}) {
  const content = policy.current_version?.content ?? "";
  const toc = extractPolicyToc(content);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/policies">
            <ArrowLeft className="h-4 w-4" />
            Back to library
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {policy.is_emergency_document ? <EmergencyPolicyBadge /> : null}
              <PolicyStatusBadge status={policy.status} />
              {policy.requires_acknowledgment ? (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                  Acknowledgment required
                </span>
              ) : null}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{policy.title}</h1>
            {policy.summary ? (
              <p className="max-w-3xl text-muted-foreground">{policy.summary}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Button variant="outline" asChild>
                <Link href={`/policies/${policy.id}/edit`}>Edit</Link>
              </Button>
            ) : null}
            <PolicyPrintButton />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meta
          label="Type"
          value={labelForPolicyDocumentType(policy.document_type)}
        />
        <Meta label="Category" value={policy.category_label ?? "—"} />
        <Meta
          label="Version"
          value={policy.version_label ? `v${policy.version_label}` : "—"}
        />
        <Meta
          label="Effective"
          value={
            policy.effective_date
              ? formatChurchDate(policy.effective_date, { timeZone })
              : "—"
          }
        />
        <Meta
          label="Review due"
          value={
            policy.review_due_date
              ? formatChurchDate(policy.review_due_date, { timeZone })
              : "—"
          }
        />
        <Meta label="Campus" value={policy.campus_name ?? "Church-wide"} />
        <Meta
          label="Last updated"
          value={formatChurchDateTime(policy.updated_at, { timeZone })}
        />
        <Meta
          label="Read time"
          value={
            policy.read_time_minutes
              ? `${policy.read_time_minutes} min`
              : "—"
          }
        />
      </div>

      {acknowledgment ? (
        <PolicyAcknowledgeForm
          policyId={policy.id}
          acknowledgment={acknowledgment}
          timeZone={timeZone}
        />
      ) : policy.requires_acknowledgment ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your acknowledgment</CardTitle>
            <CardDescription>
              Open this page after publication to receive your assignment, or
              check the acknowledgments list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/policies/acknowledgments">View acknowledgments</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {toc.length > 2 ? (
          <nav className="hidden lg:block">
            <div className="sticky top-20 space-y-2 rounded-md border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                On this page
              </p>
              <ul className="space-y-2 text-sm">
                {toc.map((item) => (
                  <li
                    key={item.id}
                    className={item.level > 1 ? "pl-3" : undefined}
                  >
                    <a
                      href={`#${item.id}`}
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        ) : (
          <div className="hidden lg:block" />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Policy content</CardTitle>
            <CardDescription>
              {policy.current_version
                ? `Version ${policy.current_version.version_label}`
                : "No published version content is available."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {content.trim() ? (
              <PolicyMarkdown content={content} />
            ) : (
              <p className="text-sm text-muted-foreground">
                This policy does not have readable content yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <PolicyAttachmentsCard
        policyId={policy.id}
        attachments={attachments ?? []}
        canManage={Boolean(canManage)}
      />

      {policy.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {policy.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
