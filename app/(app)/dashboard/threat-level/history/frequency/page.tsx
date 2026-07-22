import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchThreatLevels } from "@/lib/church/threat-level-queries";
import { ThreatLevelFrequencyChart } from "@/components/dashboard/threat-level-frequency-chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function ThreatLevelFrequencyContent() {
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
          Threat level frequency
        </h1>
        <p className="mt-1 text-muted-foreground">
          How often each threat level has been recorded for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Frequency by level</CardTitle>
          <CardDescription>
            Counts every saved threat level change (not unique weeks).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThreatLevelFrequencyChart entries={history} />
        </CardContent>
      </Card>
    </div>
  );
}

function ThreatLevelFrequencyFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading threat level frequency…
      </CardContent>
    </Card>
  );
}

async function ThreatLevelFrequencyWrapper() {
  try {
    return <ThreatLevelFrequencyContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load threat level frequency."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function ThreatLevelFrequencyPage() {
  return (
    <Suspense fallback={<ThreatLevelFrequencyFallback />}>
      <ThreatLevelFrequencyWrapper />
    </Suspense>
  );
}
