import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { canManageThreatLevels } from "@/lib/church/threat-levels";
import { listChurchThreatLevels } from "@/lib/church/threat-level-queries";
import { ThreatLevelHistoryList } from "@/components/dashboard/threat-level-history-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function ThreatLevelHistoryContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const history = await listChurchThreatLevels(church.id, 100);
  const canManage = canManageThreatLevels(membership.role);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Threat level history
            </h1>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-10">
                <Link href="/dashboard/threat-level/history/calendar">
                  Calendar
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-10">
                <Link href="/dashboard/threat-level/history/frequency">
                  Frequency
                </Link>
              </Button>
            </div>
          </div>
          <p className="mt-1 text-muted-foreground">
            Past weekly threat levels for {church.name}.
          </p>
        </div>
        {canManage ? (
          <Button asChild className="h-11 shrink-0">
            <Link href="/dashboard/threat-level">Change threat level</Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            {history.length === 0
              ? "No entries yet."
              : `${history.length} recorded change${history.length === 1 ? "" : "s"}, newest first.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThreatLevelHistoryList
            entries={history}
            timeZone={church.timezone ?? "America/Los_Angeles"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ThreatLevelHistoryFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading threat level history…
      </CardContent>
    </Card>
  );
}

async function ThreatLevelHistoryWrapper() {
  try {
    return <ThreatLevelHistoryContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load threat level history."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function ThreatLevelHistoryPage() {
  return (
    <Suspense fallback={<ThreatLevelHistoryFallback />}>
      <ThreatLevelHistoryWrapper />
    </Suspense>
  );
}
