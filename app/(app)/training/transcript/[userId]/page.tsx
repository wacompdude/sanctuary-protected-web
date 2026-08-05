import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { RenewalStatusBadge } from "@/components/training/status-badges";
import { PrintButton } from "@/components/training/print-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { listChurchTeamMemberships } from "@/lib/organization/team-queries";
import { formatChurchDate } from "@/lib/datetime/format";
import { getTrainingAccess } from "@/lib/training/access";
import { canViewSensitive } from "@/lib/training/permissions";
import { getMemberTranscript } from "@/lib/training/queries";

async function TrainingTranscriptContent({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const members = await listChurchTeamMemberships(church.id);
  const member = members.find((row) => row.userId === userId);
  if (!member) notFound();

  const transcript = await getMemberTranscript(church.id, userId, {
    includeSensitive: canViewSensitive(membership.role),
  });

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-xl font-semibold">Training transcript</h2>
          <p className="text-sm text-muted-foreground">{member.name}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Button asChild variant="outline">
            <Link href="/training/records">Back to records</Link>
          </Button>
        </div>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle>{member.name}</CardTitle>
          <CardDescription>
            {church.name} · Training transcript
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No training completions on record.
            </p>
          ) : (
            <div className="space-y-3">
              {transcript.map((record) => (
                <div
                  key={record.id}
                  className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">{record.course_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {record.category_name ?? "General"} ·{" "}
                      {formatChurchDate(record.completed_at, {
                        timeZone: church.timezone,
                      })}
                      {record.training_hours
                        ? ` · ${record.training_hours} hrs`
                        : ""}
                    </p>
                    {record.instructor_name ? (
                      <p className="text-xs text-muted-foreground">
                        Instructor: {record.instructor_name}
                      </p>
                    ) : null}
                  </div>
                  {record.renewal_status ? (
                    <RenewalStatusBadge status={record.renewal_status} />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TrainingTranscriptPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingTranscriptContent params={params} />
    </Suspense>
  );
}
