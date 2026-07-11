import { Suspense } from "react";
import Link from "next/link";
import { NewEventForm } from "@/components/events/new-event-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { ArrowLeft } from "lucide-react";

async function NewEventContent() {
  const { canManageCertifications, church } =
    await getAuthenticatedUserWithChurch();

  if (!canManageCertifications) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only administrators and security leaders can create events.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/events">
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New Event</h1>
        <p className="mt-1 text-muted-foreground">
          Create a device event for {church.name}.
        </p>
      </div>
      <NewEventForm />
    </>
  );
}

async function NewEventWrapper() {
  try {
    return <NewEventContent />;
  } catch (error) {
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load this page.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function NewEventPage() {
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
        <NewEventWrapper />
      </Suspense>
    </div>
  );
}
