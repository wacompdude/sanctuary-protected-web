import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PolicyReader } from "@/components/policies/policy-reader";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import {
  ensureMyPolicyAcknowledgment,
  getMyPolicyAcknowledgment,
} from "@/lib/policies/acknowledgments";
import { canManagePolicyDocuments } from "@/lib/policies/permissions";
import {
  getPolicyById,
  listPolicyAttachments,
} from "@/lib/policies/queries";

async function PolicyDetailContent({ id }: { id: string }) {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const policy = await getPolicyById(church.id, id);

  if (!policy) {
    notFound();
  }

  if (
    policy.status !== "published" &&
    !canManagePolicyDocuments(membership.role)
  ) {
    notFound();
  }

  if (
    policy.status === "published" &&
    policy.requires_acknowledgment
  ) {
    try {
      await ensureMyPolicyAcknowledgment(id);
    } catch {
      // Assignment RPC may be unavailable until migration 034 is applied.
    }
  }

  const [acknowledgment, attachments] = await Promise.all([
    getMyPolicyAcknowledgment(church.id, id, user.id),
    listPolicyAttachments(church.id, id),
  ]);

  return (
    <PolicyReader
      policy={policy}
      timeZone={church.timezone}
      canManage={canManagePolicyDocuments(membership.role)}
      acknowledgment={acknowledgment}
      attachments={attachments}
    />
  );
}

async function PolicyDetailWrapper({ id }: { id: string }) {
  try {
    return <PolicyDetailContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load this policy."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

async function PolicyDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PolicyDetailWrapper id={id} />;
}

export default function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading policy…
            </CardContent>
          </Card>
        }
      >
        <PolicyDetailLoader params={params} />
      </Suspense>
    </div>
  );
}
