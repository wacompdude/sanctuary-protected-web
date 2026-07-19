import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PolicyAcknowledgmentReportCard } from "@/components/policies/policy-acknowledgment-report";
import { PolicyAssignmentsEditor } from "@/components/policies/policy-assignments-editor";
import { PolicyAttachmentsCard } from "@/components/policies/policy-attachments-card";
import { PolicyForm } from "@/components/policies/policy-form";
import { PolicyStatusBadge } from "@/components/policies/policy-status-badge";
import { PolicyWorkflowActions } from "@/components/policies/policy-workflow-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { formatChurchDateTime } from "@/lib/datetime/format";
import {
  getPolicyAcknowledgmentReport,
  listActiveChurchMembersForPolicies,
  listPolicyAssignments,
} from "@/lib/policies/acknowledgments";
import {
  getPolicyById,
  listCampusesForPolicies,
  listPolicyApprovals,
  listPolicyAttachments,
  listPolicyCategories,
  listPolicyVersions,
} from "@/lib/policies/queries";

async function EditPolicyContent({ id }: { id: string }) {
  const { church } = await requireMinChurchRole("security_leader");
  const [
    policy,
    categories,
    campuses,
    versions,
    approvals,
    attachments,
    ackReport,
    assignments,
    members,
  ] = await Promise.all([
    getPolicyById(church.id, id),
    listPolicyCategories(church.id),
    listCampusesForPolicies(church.id),
    listPolicyVersions(church.id, id),
    listPolicyApprovals(church.id, id),
    listPolicyAttachments(church.id, id),
    getPolicyAcknowledgmentReport(church.id, id),
    listPolicyAssignments(church.id, id),
    listActiveChurchMembersForPolicies(church.id),
  ]);

  if (!policy) {
    notFound();
  }

  const canEditContent =
    policy.status === "draft" ||
    policy.status === "under_review" ||
    policy.status === "changes_requested" ||
    policy.status === "approved";

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href={`/policies/${id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to reader
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <PolicyStatusBadge status={policy.status} />
              {policy.version_label ? (
                <span className="text-sm text-muted-foreground">
                  v{policy.version_label}
                </span>
              ) : null}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Edit policy
            </h1>
            <p className="text-muted-foreground">{policy.title}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/policies/${id}`}>View</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/policies/manage">Manage</Link>
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
          <CardDescription>
            Submit, approve, publish, retire, or archive this document.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PolicyWorkflowActions policyId={policy.id} status={policy.status} />
        </CardContent>
      </Card>

      <PolicyAttachmentsCard
        policyId={policy.id}
        attachments={attachments}
        canManage
      />

      {canEditContent ? (
        <PolicyForm
          mode="edit"
          policy={policy}
          categories={categories}
          campuses={campuses}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Editing locked</CardTitle>
            <CardDescription>
              {policy.status === "published"
                ? "Start a revision to create a new draft version."
                : "Restore this policy to draft before editing."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href={`/policies/${id}`}>Open reader</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <PolicyAssignmentsEditor
        policyId={policy.id}
        assignments={assignments}
        members={members}
        campuses={campuses}
        audienceIsCustom={policy.audience_scope === "custom"}
      />

      <PolicyAcknowledgmentReportCard
        policyId={policy.id}
        report={ackReport}
        canManage
        requiresAcknowledgment={policy.requires_acknowledgment}
        timeZone={church.timezone}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Versions</CardTitle>
            <CardDescription>Version history for this document.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {versions.length === 0 ? (
              <p className="text-muted-foreground">No versions yet.</p>
            ) : (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">v{version.version_label}</span>
                    <span className="text-muted-foreground">
                      {version.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {formatChurchDateTime(version.created_at, {
                      timeZone: church.timezone,
                    })}
                  </p>
                  {version.change_summary ? (
                    <p className="mt-1">{version.change_summary}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval trail</CardTitle>
            <CardDescription>Recent workflow decisions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {approvals.length === 0 ? (
              <p className="text-muted-foreground">No approval events yet.</p>
            ) : (
              approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">
                      {approval.decision.replaceAll("_", " ")}
                    </span>
                    <span className="text-muted-foreground">
                      {formatChurchDateTime(approval.created_at, {
                        timeZone: church.timezone,
                      })}
                    </span>
                  </div>
                  {approval.notes ? (
                    <p className="mt-1 text-muted-foreground">{approval.notes}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function EditPolicyLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    return <EditPolicyContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof ChurchAccessError || error instanceof Error
            ? error.message
            : "Unable to open the policy editor."}
        </CardContent>
      </Card>
    );
  }
}

export default function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <EditPolicyLoader params={params} />
      </Suspense>
    </div>
  );
}
