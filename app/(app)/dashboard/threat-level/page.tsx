import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { getOperationalChurchContext, ChurchAccessError } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  canManageThreatLevels,
  formatThreatWeek,
  labelForThreatLevel,
  rankLabelForThreatLevel,
  startOfThreatWeek,
  threatLevelBadgeClassName,
  threatLevelBadgeStyle,
} from "@/lib/church/threat-levels";
import {
  getCurrentChurchThreatLevel,
  listChurchThreatLevels,
} from "@/lib/church/threat-level-queries";
import { ThreatLevelForm } from "@/components/dashboard/threat-level-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/incidents/format";

async function ThreatLevelPageContent() {
  const { church, membership } = await getOperationalChurchContext();
  if (!canManageThreatLevels(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to update the weekly threat level.",
      "FORBIDDEN_ROLE",
    );
  }

  const [currentThreatLevel, history] = await Promise.all([
    getCurrentChurchThreatLevel(church.id),
    listChurchThreatLevels(church.id, 12),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 h-11 px-3"
          asChild
        >
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Weekly Threat Level
        </h1>
        <p className="mt-1 text-muted-foreground">
          Update and review the current weekly threat posture for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current status</CardTitle>
          <CardDescription>
            The dashboard uses the most recent weekly threat level entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentThreatLevel ? (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={threatLevelBadgeClassName(
                      currentThreatLevel.threat_level,
                    )}
                    style={threatLevelBadgeStyle(currentThreatLevel.threat_level)}
                  >
                    {labelForThreatLevel(currentThreatLevel.threat_level)}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {rankLabelForThreatLevel(currentThreatLevel.threat_level)}
                  </p>
                </div>
                {currentThreatLevel.notes ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {currentThreatLevel.notes}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No notes recorded for this weekly threat level.
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Week of{" "}
                {formatThreatWeek(
                  currentThreatLevel.week_start,
                  church.timezone,
                )}
                . Last changed by {currentThreatLevel.changed_by_name} on{" "}
                {formatDateTime(
                  currentThreatLevel.created_at,
                  null,
                  church.timezone,
                )}
                .
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No weekly threat level has been recorded yet.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ThreatLevelForm
          defaultWeekStart={startOfThreatWeek()}
          defaultThreatLevel={currentThreatLevel?.threat_level ?? "green"}
          defaultNotes={currentThreatLevel?.notes ?? ""}
        />

        <Card>
          <CardHeader>
            <CardTitle>Recent history</CardTitle>
            <CardDescription>
              Weekly threat level changes, notes, and who recorded them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No threat level history has been recorded yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-md border border-border px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={threatLevelBadgeClassName(entry.threat_level)}
                        style={threatLevelBadgeStyle(entry.threat_level)}
                      >
                        {labelForThreatLevel(entry.threat_level)}
                      </span>
                      <p className="text-sm font-medium">
                        Week of{" "}
                        {formatThreatWeek(entry.week_start, church.timezone)}
                      </p>
                    </div>
                    {entry.notes ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                        {entry.notes}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No notes recorded.
                      </p>
                    )}
                    <p className="mt-2 text-sm text-muted-foreground">
                      Changed by {entry.changed_by_name}
                      {entry.changed_by_email ? ` (${entry.changed_by_email})` : ""}{" "}
                      on{" "}
                      {formatDateTime(entry.created_at, null, church.timezone)}.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ThreatLevelPageFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading threat level…
      </CardContent>
    </Card>
  );
}

async function ThreatLevelPageWrapper() {
  try {
    return <ThreatLevelPageContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load the threat level page."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function ThreatLevelPage() {
  return (
    <Suspense fallback={<ThreatLevelPageFallback />}>
      <ThreatLevelPageWrapper />
    </Suspense>
  );
}
