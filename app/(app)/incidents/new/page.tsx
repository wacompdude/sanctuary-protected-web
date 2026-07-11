import Link from "next/link";
import { NewIncidentForm } from "@/components/incidents/new-incident-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NewIncidentPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
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

      <NewIncidentForm />
    </div>
  );
}
