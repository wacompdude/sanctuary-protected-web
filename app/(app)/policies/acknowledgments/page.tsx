import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
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
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { listMyPendingPolicyAcknowledgments } from "@/lib/policies/acknowledgments";
import { labelForPolicyAcknowledgmentStatus } from "@/lib/policies/constants";

async function AcknowledgmentsContent() {
  const { church, user } = await getAuthenticatedUserWithChurch();
  const pending = await listMyPendingPolicyAcknowledgments(
    church.id,
    user.id,
  );

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/policies">
            <ArrowLeft className="h-4 w-4" />
            Back to library
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Acknowledgments</h1>
        <p className="mt-1 text-muted-foreground">
          Required policy acknowledgments for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending acknowledgments</CardTitle>
          <CardDescription>
            {pending.length === 0
              ? "You’re caught up — nothing pending."
              : `${pending.length} polic${pending.length === 1 ? "y" : "ies"} need your acknowledgment.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <Button asChild>
              <Link href="/policies">Browse policies</Link>
            </Button>
          ) : (
            <ul className="space-y-3">
              {pending.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {item.policy_title ?? "Policy"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {labelForPolicyAcknowledgmentStatus(
                        item.acknowledgment_status,
                      )}
                      {item.policy_version_label
                        ? ` · v${item.policy_version_label}`
                        : ""}
                      {item.due_at
                        ? ` · Due ${formatChurchDateTime(item.due_at, { timeZone: church.timezone })}`
                        : ""}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/policies/${item.policy_document_id}`}>
                      Review & acknowledge
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function AcknowledgmentsWrapper() {
  try {
    return <AcknowledgmentsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof ChurchAccessError || error instanceof Error
            ? error.message
            : "Unable to load acknowledgments."}
        </CardContent>
      </Card>
    );
  }
}

export default function PolicyAcknowledgmentsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <AcknowledgmentsWrapper />
      </Suspense>
    </div>
  );
}
