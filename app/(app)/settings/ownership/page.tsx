import Link from "next/link";
import { Crown } from "lucide-react";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";

async function OwnershipContent() {
  const { church } = await requireMinChurchRole("owner");

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ownership</h1>
        <p className="mt-1 text-muted-foreground">
          Owner controls for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Crown className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>Ownership transfer</CardTitle>
          <CardDescription>
            Transferring church ownership is a planned feature. It will require
            explicit confirmation, audit logging, and will never remove history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Until transfer ships, the current owner retains full control. Account
            suspension and closure are available in Church settings.
          </p>
          <Button asChild variant="outline">
                <Link href="/settings/church/general">Open church settings</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export default function OwnershipSettingsPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <OwnershipWrapper />
      </Suspense>
    </div>
  );
}

async function OwnershipWrapper() {
  try {
    return <OwnershipContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : "Unable to load ownership settings.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}
