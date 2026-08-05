import Link from "next/link";
import { Suspense } from "react";
import { RenewalStatusBadge } from "@/components/training/status-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExternalTrainingForm } from "@/components/training/external-training-form";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { listChurchTeamMemberships } from "@/lib/organization/team-queries";
import { resolveCampusFilter } from "@/lib/campuses/filter";
import { formatChurchDate } from "@/lib/datetime/format";
import { getTrainingAccess } from "@/lib/training/access";
import {
  canSubmitExternalTraining,
  canVerifyExternalTraining,
  canViewSensitive,
} from "@/lib/training/permissions";
import {
  listCategories,
  listCompletionRecords,
  listExternalRecords,
} from "@/lib/training/queries";
import { verifyExternalTrainingFormAction } from "@/app/(app)/training/actions";

async function TrainingRecordsContent() {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const includeSensitive = canViewSensitive(membership.role);
  const campusFilter = await resolveCampusFilter({
    organizationId: church.id,
    userId: user.id,
    role: membership.role,
  });

  const [records, external, categories, members] = await Promise.all([
    listCompletionRecords(church.id, {
      campusFilter,
      includeSensitive,
    }),
    listExternalRecords(church.id),
    listCategories(church.id, { includeSensitive }),
    listChurchTeamMemberships(church.id),
  ]);

  const pendingExternal = external.filter(
    (row) =>
      row.verification_status === "pending_verification" ||
      row.verification_status === "not_reviewed",
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Completion records</h2>
        <p className="text-sm text-muted-foreground">
          Permanent training history and external submissions.
        </p>
      </div>

      {canSubmitExternalTraining(membership.role) ? (
        <ExternalTrainingForm
          categories={categories}
          members={members.filter((m) => m.status === "active")}
          currentUserId={user.id}
        />
      ) : null}

      {canVerifyExternalTraining(membership.role) && pendingExternal.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending external verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingExternal.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{row.course_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.member_name ?? "Member"} · {row.completion_date}
                  </p>
                </div>
                <form action={verifyExternalTrainingFormAction.bind(null, row.id)}>
                  <Button type="submit" size="sm">
                    Verify
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {records.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No completion records yet.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium">Renewal</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/training/transcript/${record.user_id}`}
                      className="hover:underline"
                    >
                      {record.member_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div>{record.course_name}</div>
                    {record.category_name ? (
                      <div className="text-xs text-muted-foreground">
                        {record.category_name}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {formatChurchDate(record.completed_at, { timeZone: church.timezone })}
                  </td>
                  <td className="px-3 py-2">
                    {record.renewal_status ? (
                      <RenewalStatusBadge status={record.renewal_status} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TrainingRecordsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingRecordsContent />
    </Suspense>
  );
}
