import Link from "next/link";
import { Activity } from "lucide-react";
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

async function AccountContent() {
  const { supabase, church } = await requireMinChurchRole("owner");
  const { data } = await supabase
    .from("churches")
    .select("status, plan_name, trial_ends_at, created_at, updated_at")
    .eq("id", church.id)
    .maybeSingle();

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account status</h1>
        <p className="mt-1 text-muted-foreground">
          Lifecycle summary for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Activity className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>Church account lifecycle</CardTitle>
          <CardDescription>
            Suspend, reactivate, and close actions live in Church settings.
            Permanent deletion is not offered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1 font-medium capitalize">
                {data?.status ?? church.status}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Plan
              </dt>
              <dd className="mt-1 text-sm">
                {data?.plan_name?.trim() || "Placeholder — not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Trial ends
              </dt>
              <dd className="mt-1 text-sm">
                {data?.trial_ends_at
                  ? new Date(data.trial_ends_at).toLocaleString()
                  : "Placeholder — not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Church ID
              </dt>
              <dd className="mt-1 font-mono text-xs break-all">{church.id}</dd>
            </div>
          </dl>
          <Button asChild>
            <Link href="/settings/church/danger">Manage in church settings</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export default function AccountStatusPage() {
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
        <AccountWrapper />
      </Suspense>
    </div>
  );
}

async function AccountWrapper() {
  try {
    return <AccountContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : "Unable to load account status.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}
