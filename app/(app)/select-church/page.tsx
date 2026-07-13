import { Suspense } from "react";
import Link from "next/link";
import { SelectChurchList } from "@/components/select-church-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChurchAccessError,
  requireChurchMembership,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { ArrowLeft, Plus } from "lucide-react";

async function SelectChurchContent() {
  const { church, memberships } = await requireChurchMembership();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Select church</h1>
          <p className="mt-1 text-muted-foreground">
            Choose which church you are working in, or create another
            organization to switch between.
          </p>
        </div>
        <Button asChild>
          <Link href="/churches/new">
            <Plus className="h-4 w-4" />
            Create church
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your churches</CardTitle>
          <CardDescription>
            Currently active: <span className="font-medium">{church.name}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SelectChurchList
            churches={memberships.map((membership) => ({
              id: membership.church_id,
              name: membership.church.name,
              role: membership.role,
            }))}
            activeChurchId={church.id}
          />
          {memberships.length <= 1 && (
            <p className="mt-4 text-sm text-muted-foreground">
              You only belong to one church right now.{" "}
              <Link
                href="/churches/new"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Create another church
              </Link>{" "}
              or accept an invitation to switch between organizations.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function SelectChurchWrapper() {
  try {
    return <SelectChurchContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load your churches.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function SelectChurchPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading churches…
            </CardContent>
          </Card>
        }
      >
        <SelectChurchWrapper />
      </Suspense>
    </div>
  );
}
