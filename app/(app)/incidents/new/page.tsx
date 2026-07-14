import Link from "next/link";
import { Suspense } from "react";
import { NewIncidentForm } from "@/components/incidents/new-incident-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { getOperationalChurchContext } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { Card, CardContent } from "@/components/ui/card";
import { ChurchAccessError } from "@/lib/church/errors";

async function NewIncidentContent() {
  const { supabase, church } = await getOperationalChurchContext();
  const { data } = await supabase
    .from("churches")
    .select(
      "require_incident_location, require_incident_severity, allow_security_members_create_incidents",
    )
    .eq("id", church.id)
    .maybeSingle();

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/incidents">
            <ArrowLeft className="h-4 w-4" />
            Back to Incidents
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New Incident</h1>
        <p className="mt-1 text-muted-foreground">
          Report a new security incident for your team to review.
        </p>
      </div>

      <NewIncidentForm
        requireLocation={data?.require_incident_location ?? true}
        requireSeverity={data?.require_incident_severity ?? true}
      />
    </>
  );
}

async function NewIncidentWrapper() {
  try {
    return <NewIncidentContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to open the incident form."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function NewIncidentPage() {
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
        <NewIncidentWrapper />
      </Suspense>
    </div>
  );
}
