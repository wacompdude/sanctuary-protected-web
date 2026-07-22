import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchThreatLevels } from "@/lib/church/threat-level-queries";
import { ThreatLevelHistoryCalendar } from "@/components/dashboard/threat-level-history-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

async function ThreatLevelCalendarContent() {
  const { church } = await getAuthenticatedUserWithChurch();
  const history = await listChurchThreatLevels(church.id, 500);

  return (
    <div className="space-y-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 h-11 px-3"
          asChild
        >
          <Link href="/dashboard/threat-level/history">
            <ArrowLeft className="h-4 w-4" />
            Back to history
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Threat level calendar
        </h1>
        <p className="mt-1 text-muted-foreground">
          Monthly view of weekly threat levels and recorded changes for{" "}
          {church.name}.
        </p>
      </div>

      <ThreatLevelHistoryCalendar
        entries={history}
        timeZone={church.timezone ?? "America/Los_Angeles"}
      />
    </div>
  );
}

function ThreatLevelCalendarFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading threat level calendar…
      </CardContent>
    </Card>
  );
}

async function ThreatLevelCalendarWrapper() {
  try {
    return <ThreatLevelCalendarContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load threat level calendar."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function ThreatLevelCalendarPage() {
  return (
    <Suspense fallback={<ThreatLevelCalendarFallback />}>
      <ThreatLevelCalendarWrapper />
    </Suspense>
  );
}
